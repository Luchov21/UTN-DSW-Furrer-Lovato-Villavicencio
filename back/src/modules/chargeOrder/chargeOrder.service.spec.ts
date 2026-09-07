import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FindOperator } from 'typeorm';
import { ChargeOrderService } from './chargeOrder.service';
import { ChargeOrder } from './entity/chargeOrder.entity';
import { ChargeOrderMethod } from './enum/chargeOrder-method.enum';
import { ChargeOrderStatus } from './enum/chargeOrder-status.enum';
import { subscriptionService } from '../subscription/subscription.service';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';
import { PlanDurationService } from '../plan/plan-duration.service';
import { PlanService } from '../plan/plan.service';
import { UserService } from '../user/user.service';
import { ORDER_EXPIRATION_MS } from './chargeOrder.rules';

// The shape manager.save is invoked with in createCharge, spelled out so
// `.mock.calls[0][0]` reads back as something other than `any`.
interface SavedChargeOrderPayload {
  expiresAt: Date;
  externalReference: string;
}

describe('ChargeOrderService.createCharge', () => {
  let service: ChargeOrderService;
  let repository: {
    manager: { transaction: jest.Mock };
    update: jest.Mock;
  };
  let subscriptions: { findByUser: jest.Mock };
  let planDurations: { findByPlan: jest.Mock };
  let plans: { findPlan: jest.Mock };
  let members: { findUser: jest.Mock };
  // The transaction's EntityManager, and the pessimistic-locked query
  // builder it hands back from createQueryBuilder — chainable, same shape
  // TypeORM's real one exposes for setLock/where/andWhere/getOne.
  let manager: {
    createQueryBuilder: jest.Mock;
    create: jest.Mock;
    save: jest.Mock<
      Promise<{ id: number } & SavedChargeOrderPayload>,
      [SavedChargeOrderPayload]
    >;
  };
  let queryBuilder: {
    setLock: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    getOne: jest.Mock;
  };

  const member = { id: 3, deleted: false };

  const plan = { id: 12, name: 'Plan Test', numDays: 30, price: 5000 };

  const duration = {
    id: 55,
    planId: 12,
    months: 3,
    numDays: 90,
    price: 15000,
    deleted: false,
  };

  const params = {
    userId: 3,
    planId: 12,
    months: 3,
    amount: 14000, // discounted below the 15000 list price on purpose
    method: 'point' as const,
    collectionPointId: 'terminal-1',
    adminId: 30111222,
  };

  // busyOrder: what the pessimistic-locked check finds, if anything.
  const buildService = async (busyOrder: unknown = null) => {
    queryBuilder = {
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(busyOrder),
    };
    manager = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      create: jest.fn((_entity: unknown, data: object) => data),
      save: jest.fn((entity: SavedChargeOrderPayload) =>
        Promise.resolve({ id: 1, ...entity }),
      ),
    };
    repository = {
      manager: {
        transaction: jest.fn((cb: (manager: unknown) => unknown) =>
          cb(manager),
        ),
      },
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanDurationService, useValue: planDurations },
        { provide: PlanService, useValue: plans },
        { provide: UserService, useValue: members },
      ],
    }).compile();

    service = moduleRef.get(ChargeOrderService);
  };

  beforeEach(() => {
    subscriptions = {
      findByUser: jest.fn().mockResolvedValue([]),
    };
    planDurations = {
      findByPlan: jest.fn().mockResolvedValue([duration]),
    };
    plans = {
      findPlan: jest.fn().mockResolvedValue(plan),
    };
    members = {
      findUser: jest.fn().mockResolvedValue(member),
    };
  });

  it('snapshots the admin amount, not the list price', async () => {
    await buildService();

    await service.createCharge(params);

    expect(manager.create).toHaveBeenCalledWith(
      ChargeOrder,
      expect.objectContaining({
        amount: 14000,
        termMonths: 3,
        planDurationId: 55,
      }),
    );
  });

  it('arms the order with no subscription', async () => {
    await buildService();

    await service.createCharge(params);

    expect(manager.create).toHaveBeenCalledWith(
      ChargeOrder,
      expect.objectContaining({ userId: 3, planId: 12, subscriptionId: null }),
    );
  });

  it('rejects a member whose membership is paused', async () => {
    await buildService();
    subscriptions.findByUser.mockResolvedValue([
      { id: 9, userId: 3, state: SubscriptionState.PAUSED, deleted: false },
    ]);

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  // findByUser orders { id: 'DESC' }, so a stale PAUSED row that isn't the
  // member's current subscription must not block a charge. Without this, a
  // member who paused and was later re-sold a plan for cash (registerPlanPayment
  // has no paused guard) would find every future Point/QR charge permanently
  // refused by the old, already-superseded PAUSED row.
  it('allows a charge when only an older, superseded subscription is paused', async () => {
    await buildService();
    subscriptions.findByUser.mockResolvedValue([
      { id: 10, userId: 3, state: SubscriptionState.ACTIVE, deleted: false },
      { id: 5, userId: 3, state: SubscriptionState.PAUSED, deleted: false },
    ]);

    await expect(service.createCharge(params)).resolves.toBeDefined();
  });

  it('rejects a plan that does not exist', async () => {
    await buildService();
    plans.findPlan.mockResolvedValue(null);

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('refuses a second order on a collection point that is busy', async () => {
    await buildService({
      id: 1,
      collectionPointId: 'terminal-1',
      status: ChargeOrderStatus.PENDING,
    });

    await expect(service.createCharge(params)).rejects.toThrow(
      new ConflictException('Ya hay un cobro en curso en este punto de cobro.'),
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('runs the busy check and the insert inside one transaction, with a pessimistic write lock', async () => {
    // Guards against the race this table exists to prevent: two
    // near-simultaneous createCharge calls for the same collectionPointId
    // must not both pass the check before either saves. The lock forces a
    // concurrent transaction to block on the check rather than race past it.
    await buildService();

    await service.createCharge(params);

    expect(repository.manager.transaction).toHaveBeenCalled();
    expect(manager.createQueryBuilder).toHaveBeenCalledWith(
      ChargeOrder,
      expect.any(String),
    );
    expect(queryBuilder.setLock).toHaveBeenCalledWith('pessimistic_write');
    // The check and the insert both go through the SAME manager passed into
    // the transaction callback, not the outer repository.
    expect(manager.create).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalled();
  });

  it('scopes the busy check by collectionPointId, not by userId', async () => {
    // A future regression that scoped this check by userId instead
    // of collectionPointId would let two different members hold live orders
    // on the same physical point at once — exactly what this table exists
    // to prevent. Asserting the actual query args (not just the outcome)
    // catches that even though every other test in this file happens to
    // reuse the same userId/collectionPointId pair.
    await buildService();

    await service.createCharge(params);

    expect(queryBuilder.where).toHaveBeenCalledWith(expect.any(String), {
      collectionPointId: params.collectionPointId,
    });
    const [whereClause, whereParams] = queryBuilder.where.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    const [andWhereClause, andWhereParams] = queryBuilder.andWhere.mock
      .calls[0] as [string, Record<string, unknown>];
    expect(whereClause).not.toMatch(/userId/);
    expect(andWhereClause).not.toMatch(/userId/);
    expect(whereParams).not.toHaveProperty('userId');
    expect(andWhereParams).not.toHaveProperty('userId');
  });

  it('refuses a busy collection point even when the existing order belongs to a different member', async () => {
    // Same rule from the other direction: a busy order for a DIFFERENT
    // member on the SAME collectionPointId must still block — the code must
    // not, say, additionally filter the found row by userId client-side
    // before deciding whether to throw.
    await buildService({
      id: 1,
      userId: 999,
      collectionPointId: params.collectionPointId,
      status: ChargeOrderStatus.PENDING,
    });

    await expect(service.createCharge(params)).rejects.toThrow(
      new ConflictException('Ya hay un cobro en curso en este punto de cobro.'),
    );
  });

  it('allows a new order once the previous one expired', async () => {
    // expireStale() has already flipped the stale order to EXPIRED by the
    // time the busy check runs, so the pessimistic-locked lookup finds
    // nothing.
    await buildService(null);

    await service.createCharge(params);

    expect(repository.update).toHaveBeenCalled();
    expect(manager.save).toHaveBeenCalled();
  });

  it('sets expiresAt from ORDER_EXPIRATION_MS', async () => {
    await buildService();
    const before = Date.now();

    await service.createCharge(params);

    const savedArg = manager.save.mock.calls[0][0];
    const after = Date.now();
    expect(savedArg.expiresAt.getTime()).toBeGreaterThanOrEqual(
      before + ORDER_EXPIRATION_MS,
    );
    expect(savedArg.expiresAt.getTime()).toBeLessThanOrEqual(
      after + ORDER_EXPIRATION_MS,
    );
  });

  it('routes method=qr to the caja and method=point to the terminal', async () => {
    await buildService();

    await service.createCharge({
      ...params,
      method: 'qr',
      collectionPointId: 'caja-5',
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'qr', collectionPointId: 'caja-5' }),
    );

    manager.save.mockClear();
    await service.createCharge({
      ...params,
      method: 'point',
      collectionPointId: 'terminal-9',
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'point',
        collectionPointId: 'terminal-9',
      }),
    );
  });

  it('refuses a charge when the member does not exist', async () => {
    await buildService();
    members.findUser.mockResolvedValue(null);

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('refuses a charge when the member is soft-deleted', async () => {
    await buildService();
    members.findUser.mockResolvedValue({ ...member, deleted: true });

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('refuses a months value with no matching duration for this plan', async () => {
    // findByPlan is already scoped to the order's own planId, so a
    // duration belonging to a different plan can no longer leak in here the
    // way a bare id lookup used to have to guard against — an empty result is
    // the only way "no match" happens now.
    await buildService();
    planDurations.findByPlan.mockResolvedValue([]);

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('builds the external reference from the user id', async () => {
    await buildService();

    await service.createCharge(params);

    const savedArg = manager.save.mock.calls[0][0];
    expect(savedArg.externalReference).toMatch(/^flg-user-3-/);
  });

  it('creates the order with pendiente status', async () => {
    await buildService();

    await service.createCharge(params);

    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChargeOrderStatus.PENDING }),
    );
  });

  it('skips the busy-point check for an online order', async () => {
    await buildService();

    await service.createCharge({
      ...params,
      method: 'online',
      collectionPointId: null,
      adminId: null,
    });

    expect(manager.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('still enforces the busy-point check for a point order', async () => {
    await buildService();
    queryBuilder.getOne.mockResolvedValue({ id: 99 });

    await expect(service.createCharge(params)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(manager.createQueryBuilder).toHaveBeenCalled();
  });

  it('refuses an online order that carries a collection point', async () => {
    // The pairing the busy-point lock rests on: 'online' is the only method
    // that skips the lock, so an 'online' order holding a real caja id would
    // arm a second live charge on a shared physical QR with nothing guarding
    // it. CreateChargeOrderDto refuses this at the front-desk endpoint; this
    // is the service's own backstop.
    await buildService();

    await expect(
      service.createCharge({
        ...params,
        method: 'online',
        collectionPointId: 'caja-5',
        adminId: null,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it.each(['point', 'qr'] as const)(
    'refuses a %s order with no collection point',
    async (method) => {
      // The mirror image: a front-desk order with a null caja id would take
      // the lock on a null key, serialising (or silently skipping) the one
      // check that keeps two members off the same terminal.
      await buildService();

      await expect(
        service.createCharge({ ...params, method, collectionPointId: null }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repository.manager.transaction).not.toHaveBeenCalled();
    },
  );

  it('stores an online order with no collection point and no admin', async () => {
    await buildService();

    await service.createCharge({
      ...params,
      method: 'online',
      collectionPointId: null,
      adminId: null,
    });

    expect(manager.create).toHaveBeenCalledWith(
      ChargeOrder,
      expect.objectContaining({
        method: 'online',
        collectionPointId: null,
        createdById: null,
        status: ChargeOrderStatus.PENDING,
      }),
    );
  });

  it('uses a caller-supplied external reference when given one', async () => {
    await buildService();

    const saved = await service.createCharge({
      userId: 7,
      planId: 12,
      months: 1,
      amount: 19995,
      method: 'online',
      collectionPointId: null,
      adminId: null,
      externalReference: 'flg-user-7-a1b2c3d4',
    });

    expect(saved.externalReference).toBe('flg-user-7-a1b2c3d4');
  });

  it('still mints one when the caller supplies none', async () => {
    await buildService();

    const saved = await service.createCharge({
      userId: 7,
      planId: 12,
      months: 1,
      amount: 19995,
      method: 'online',
      collectionPointId: null,
      adminId: null,
    });

    expect(saved.externalReference).toMatch(/^flg-user-7-[a-f0-9]{8}$/);
  });

  // Load-bearing regression guard, carried forward from Task 6's review:
  // resolveTerm(plan, months, durations) throws NotFoundException for any
  // months value with no matching PlanDuration, and no plan has a 0-month
  // duration. A prorated plan-change charge arrives here with months: 0 (the
  // ResolvedCharge.termMonths convention — a proration buys no term), so
  // without a branch this would throw one layer below where checkout.service
  // already resolves the correct amount.
  it('does not throw for a prorated plan-change charge (months: 0)', async () => {
    await buildService();

    const saved = await service.createCharge({
      ...params,
      months: 0,
      changeFromSubscriptionId: 10,
    });

    expect(manager.create).toHaveBeenCalledWith(
      ChargeOrder,
      expect.objectContaining({
        termMonths: 0,
        planDurationId: null,
        changeFromSubscriptionId: 10,
      }),
    );
    expect(saved).toBeDefined();
  });

  it('records changeFromSubscriptionId as null for an ordinary term purchase', async () => {
    await buildService();

    await service.createCharge(params);

    expect(manager.create).toHaveBeenCalledWith(
      ChargeOrder,
      expect.objectContaining({ changeFromSubscriptionId: null }),
    );
  });
});

describe('ChargeOrderService.findByExternalReference', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock };

  beforeEach(async () => {
    repository = { findOne: jest.fn().mockResolvedValue({ id: 1 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('looks the order up by externalReference', async () => {
    const result = await service.findByExternalReference('flg-sub-7-abcd1234');

    expect(repository.findOne).toHaveBeenCalledWith({
      where: { externalReference: 'flg-sub-7-abcd1234' },
    });
    expect(result).toEqual({ id: 1 });
  });
});

describe('ChargeOrderService.findById', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock };

  beforeEach(async () => {
    repository = { findOne: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('looks the order up by id', async () => {
    repository.findOne.mockResolvedValue({ id: 1 });

    const result = await service.findById(1);

    expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result).toEqual({ id: 1 });
  });

  it('throws NotFoundException when the id does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.findById(999)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('ChargeOrderService.setMpOrderId', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('sets the mpOrderId on the order', async () => {
    repository.findOne.mockResolvedValue({ id: 1, mpOrderId: null });

    await service.setMpOrderId(1, 'mp-order-123');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ mpOrderId: 'mp-order-123' }),
    );
  });

  // A point order's controller call omits the third argument entirely —
  // must default to null rather than leaving the field untouched, so a
  // point order's qrPayload never lingers from some earlier state.
  it('defaults qrPayload to null when not passed', async () => {
    repository.findOne.mockResolvedValue({ id: 1, qrPayload: 'stale-value' });

    await service.setMpOrderId(1, 'mp-order-123');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ qrPayload: null }),
    );
  });

  // A qr order's controller call passes MpOrderResult.qrData through as the
  // third argument — this is the only place the payload gets persisted.
  it('sets qrPayload on the order when passed', async () => {
    repository.findOne.mockResolvedValue({ id: 1, qrPayload: null });

    await service.setMpOrderId(1, 'mp-order-123', 'qr-payload-data');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        mpOrderId: 'mp-order-123',
        qrPayload: 'qr-payload-data',
      }),
    );
  });

  it('throws NotFoundException when the id does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.setMpOrderId(999, 'mp-order-123'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ChargeOrderService.closeAsPaid', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('marks the order paid and records the paymentId', async () => {
    repository.findOne.mockResolvedValue({
      id: 1,
      externalReference: 'flg-sub-7-abcd1234',
      status: ChargeOrderStatus.PENDING,
      paymentId: null,
    });

    const result = await service.closeAsPaid('flg-sub-7-abcd1234', 42);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: ChargeOrderStatus.PAID,
        paymentId: 42,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: ChargeOrderStatus.PAID,
        paymentId: 42,
      }),
    );
  });

  it('throws NotFoundException when the reference does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.closeAsPaid('missing-ref', 42)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ChargeOrderService.closeAsError', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('marks the order as error', async () => {
    repository.findOne.mockResolvedValue({
      id: 1,
      externalReference: 'flg-sub-7-abcd1234',
      status: ChargeOrderStatus.PENDING,
    });

    await service.closeAsError('flg-sub-7-abcd1234', 'MP rejected the order');

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChargeOrderStatus.ERROR }),
    );
  });

  it('throws NotFoundException when the reference does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(
      service.closeAsError('missing-ref', 'whatever'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ChargeOrderService.cancel', () => {
  let service: ChargeOrderService;
  let repository: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      save: jest.fn((entity: object) => Promise.resolve(entity)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('marks the order cancelled', async () => {
    repository.findOne.mockResolvedValue({
      id: 1,
      status: ChargeOrderStatus.PENDING,
    });

    await service.cancel(1, 30111222);

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChargeOrderStatus.CANCELLED }),
    );
  });

  it('throws NotFoundException when the order does not exist', async () => {
    repository.findOne.mockResolvedValue(null);

    await expect(service.cancel(999, 30111222)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('ChargeOrderService.expireStale', () => {
  let service: ChargeOrderService;
  let repository: { update: jest.Mock };

  beforeEach(async () => {
    repository = { update: jest.fn().mockResolvedValue({ affected: 2 }) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ChargeOrderService,
        { provide: getRepositoryToken(ChargeOrder), useValue: repository },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: UserService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ChargeOrderService);
  });

  it('bulk-updates every pendiente order past expiresAt to expirada', async () => {
    await service.expireStale();

    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: ChargeOrderStatus.PENDING }),
      expect.objectContaining({ status: ChargeOrderStatus.EXPIRED }),
    );
  });

  it('never sweeps an online order', async () => {
    // An online checkout left in_process keeps its order PENDING on purpose,
    // so ChargeOrderResolverAdapter can still resolve it when Mercado Pago's
    // webhook reports the outcome. Any front-desk charge running this sweep
    // must not expire that row out from under the recovery.
    await service.expireStale();

    const [criteria] = repository.update.mock.calls[0] as [
      { method?: FindOperator<string> },
    ];
    expect(criteria.method).toBeInstanceOf(FindOperator);
    expect(criteria.method?.type).toBe('not');
    expect(criteria.method?.value).toBe(ChargeOrderMethod.ONLINE);
  });
});
