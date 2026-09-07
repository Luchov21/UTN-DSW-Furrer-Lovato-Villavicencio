import { Test } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { Payment } from './entity/payment.entity';
import { subscriptionService } from '../subscription/subscription.service';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';
import { UserService } from '../user/user.service';
import { PaymentState } from './enum/payment-state.enum';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';

describe('PaymentService.createManualPayment', () => {
  let service: PaymentService;
  let repository: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let subscriptions: { findSubscription: jest.Mock; activate: jest.Mock };
  let users: { findUser: jest.Mock };

  const dto = { subscriptionId: 7, amount: 15000, payMethod: 'efectivo' };

  const buildService = async () => {
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: jest.fn().mockResolvedValue([]),
    };
    users = users ?? { findUser: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: repository },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  };

  it('promotes a PENDING subscription when the payment is recorded', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan: { numDays: 30, price: 15000 },
      }),
      activate: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await service.createManualPayment(dto, 30111222);

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 30);
    expect(repository.save).toHaveBeenCalled();
  });

  // The old "leaves an already ACTIVE subscription alone" case lived here.
  // That was the bug: an advance payment against an ACTIVE subscription must
  // extend endDate, not be ignored. It's replaced by the
  // 'createManualPayment — advance payment' describe block below, which
  // covers the fixed three-way branch (PENDING/ACTIVE/PAUSED).

  it('activates nothing when the subscription does not exist', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue(null),
      activate: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await expect(
      service.createManualPayment(dto, 30111222),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('createManualPayment — advance payment', () => {
  let service: PaymentService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let subscriptions: {
    findSubscription: jest.Mock;
    activate: jest.Mock;
    renew: jest.Mock;
  };
  let users: { findUser: jest.Mock };

  const dto = { subscriptionId: 7, amount: 15000, payMethod: 'efectivo' };
  const plan = { numDays: 30, price: 15000 };

  // findOne backs findCurrentTermPayment, which the ACTIVE branch now asks
  // "has this subscription ever actually been paid for?". Defaulting to a
  // real row keeps every pre-existing ACTIVE case in this block on the
  // advance-payment (renew) path it was written for; the two new tests below
  // override it.
  const buildService = async (currentTermPayment: unknown = { id: 42 }) => {
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(currentTermPayment),
    };
    users = { findUser: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: repository },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  };

  afterEach(() => {
    delete process.env.MP_ENABLED;
  });

  it('extends an ACTIVE subscription instead of ignoring it', async () => {
    // The bug: today this writes a payment row and leaves endDate untouched,
    // so a member paying early in cash gets nothing for their money.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await service.createManualPayment(dto, 30111222);

    expect(subscriptions.renew).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  // The front-desk new-member wizard: assignPlanToMember opens the
  // subscription ACTIVE with the full period already granted but with zero
  // payments recorded, and the wizard's last step records the cash payment.
  // Renewing here would extend on top of a period nobody has paid for yet —
  // 2x the days for 1x the money.
  it('activates (does not extend) the first payment against an admin-assigned ACTIVE subscription', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    // No completed, non-refunded payment exists for this subscription yet.
    await buildService(null);

    await service.createManualPayment({ ...dto, termMonths: 3 }, 30111222);

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 90);
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  // The regression guard for the case above: a subscription that HAS been
  // paid for is a genuine advance payment and must still extend, exactly as
  // it did before.
  it('still extends an ACTIVE subscription that already has a completed payment', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService({
      id: 42,
      subscriptionId: 7,
      state: PaymentState.COMPLETED,
      refundedAt: null,
    });

    await service.createManualPayment({ ...dto, termMonths: 3 }, 30111222);

    expect(subscriptions.renew).toHaveBeenCalledWith(7, 90);
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  it('still activates a PENDING subscription', async () => {
    // The existing behaviour must not regress: this is the self-service gate.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await service.createManualPayment(dto, 30111222);

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  it('refuses a payment against a PAUSED subscription', async () => {
    // Extending a frozen membership here AND at unpause would hand the
    // member the same days twice.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PAUSED,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await expect(service.createManualPayment(dto, 30111222)).rejects.toThrow(
      new ConflictException('Reanudá la membresía antes de registrar un pago.'),
    );
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('works with MP_ENABLED=false', async () => {
    // Cash must never depend on Mercado Pago being configured or reachable.
    process.env.MP_ENABLED = 'false';
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await expect(
      service.createManualPayment(dto, 30111222),
    ).resolves.toBeDefined();
    expect(repository.save).toHaveBeenCalled();
  });

  it('treats an INACTIVE (lapsed) subscription like PENDING and activates it', async () => {
    // The nightly sweep (expireLapsedSubscriptions) sets state: INACTIVE on
    // a lapsed subscription without deleting it. A lapsed member paying to
    // come back is the single most common real case this branch handles —
    // silently no-op'ing here would mean they pay and still have no access.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.INACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await service.createManualPayment(dto, 30111222);

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalled();
  });

  it('refuses a payment against a CANCELLED subscription', async () => {
    // A cancelled subscription is a dead historical record; an admin must
    // pay against the member's actual current subscription, not this one.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.CANCELLED,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService();

    await expect(service.createManualPayment(dto, 30111222)).rejects.toThrow(
      new ConflictException('Esta suscripción está cancelada.'),
    );
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});

describe('createFromMercadoPago', () => {
  let service: PaymentService;
  let repository: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
  };
  let subscriptions: {
    findSubscription: jest.Mock;
    activate: jest.Mock;
    renew: jest.Mock;
  };
  let users: { findUser: jest.Mock };

  const plan = { numDays: 30, price: 15000 };

  const buildService = async (existingPayment: unknown = null) => {
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(existingPayment),
    };
    users = { findUser: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: repository },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  };

  it('records a completed payment and activates a pending subscription', async () => {
    // registeredById stays null for an online renewal — nobody recorded it.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);

    const result = await service.createFromMercadoPago({
      mpPaymentId: 'mp-123',
      subscriptionId: 7,
      amount: 15000,
      termMonths: 1,
      payMethod: 'mercadopago',
    });

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ registeredById: null, mpPaymentId: 'mp-123' }),
    );
    expect(result).toBeDefined();
  });

  it('persists mpOrderId from the dto', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 44,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);

    const payment = await service.createFromMercadoPago({
      mpPaymentId: 'mp-2',
      subscriptionId: 44,
      amount: 10000,
      termMonths: 1,
      payMethod: 'mercadopago',
      mpOrderId: 'ORD02',
    });

    expect(payment.mpOrderId).toBe('ORD02');
  });

  it('renews instead of activating when the subscription is already active', async () => {
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);
    // findOne is asked twice on an ACTIVE subscription: first as
    // findByMpPaymentId (nothing recorded yet for this MP payment), then as
    // findCurrentTermPayment — a real row there means this subscription has
    // already been paid for, so this is a genuine advance payment and must
    // extend rather than re-activate.
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 42 });

    await service.createFromMercadoPago({
      mpPaymentId: 'mp-124',
      subscriptionId: 7,
      amount: 15000,
      termMonths: 1,
      payMethod: 'mercadopago',
    });

    expect(subscriptions.renew).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.activate).not.toHaveBeenCalled();
  });

  it('extends by the full multi-month term, not by one month', async () => {
    // A 12-month term on a 30-day plan must add 360 days.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);
    // As above: nothing recorded for this MP payment, but the subscription
    // already has a completed payment, so this extends.
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 42 });

    await service.createFromMercadoPago({
      mpPaymentId: 'mp-125',
      subscriptionId: 7,
      amount: 150000,
      termMonths: 12,
      payMethod: 'mercadopago',
    });

    expect(subscriptions.renew).toHaveBeenCalledWith(7, 360);
  });

  it('activates a PENDING subscription with the full multi-month term, not one month', async () => {
    // Mirrors the ACTIVE-side 'extends by the full multi-month term' test
    // above: a 3-month term on a 30-day plan must activate with 90 days,
    // not silently collapse to plan.numDays (30).
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);

    await service.createFromMercadoPago({
      mpPaymentId: 'mp-131',
      subscriptionId: 7,
      amount: 45000,
      termMonths: 3,
      payMethod: 'mercadopago',
    });

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 90);
    expect(subscriptions.renew).not.toHaveBeenCalled();
  });

  it('returns the existing payment when mpPaymentId was already recorded', async () => {
    // MP retries a notification up to eight times over four days. The second
    // delivery must not write a second row, and must not extend twice.
    const existingPayment = { id: 99, mpPaymentId: 'mp-126', amount: 15000 };
    subscriptions = {
      findSubscription: jest.fn(),
      activate: jest.fn(),
      renew: jest.fn(),
    };
    await buildService(existingPayment);

    const result = await service.createFromMercadoPago({
      mpPaymentId: 'mp-126',
      subscriptionId: 7,
      amount: 15000,
      termMonths: 1,
      payMethod: 'mercadopago',
    });

    expect(result).toBe(existingPayment);
    expect(subscriptions.findSubscription).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('snapshots termMonths and monthlyPriceAtPurchase', async () => {
    // A refund years later must use the prices actually agreed.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan: { numDays: 30, price: 20000 },
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);

    await service.createFromMercadoPago({
      mpPaymentId: 'mp-127',
      subscriptionId: 7,
      amount: 60000,
      termMonths: 3,
      payMethod: 'mercadopago',
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ termMonths: 3, monthlyPriceAtPurchase: 20000 }),
    );
  });

  it('activates an INACTIVE (lapsed) subscription, confirming it shares the fixed branch', async () => {
    // Same shared promoteOrExtendSubscription helper as createManualPayment;
    // this just confirms the wiring is used here too, not a full re-test of
    // every branch (that's covered in the 'advance payment' describe block).
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.INACTIVE,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);

    await service.createFromMercadoPago({
      mpPaymentId: 'mp-128',
      subscriptionId: 7,
      amount: 15000,
      termMonths: 1,
      payMethod: 'mercadopago',
    });

    expect(subscriptions.activate).toHaveBeenCalledWith(7, 30);
    expect(subscriptions.renew).not.toHaveBeenCalled();
  });

  it('recovers gracefully when a duplicate-key race loses to another delivery', async () => {
    // Two near-simultaneous deliveries of the same mpPaymentId can both pass
    // the findByMpPaymentId check before either saves. The DB's UNIQUE
    // constraint stops the second payment ROW from being written, but that
    // surfaces as a duplicate-key error from save() rather than a graceful
    // "already exists" — this must be caught and turned into returning the
    // row the other delivery wrote, not an uncaught 500.
    const existingPayment = { id: 100, mpPaymentId: 'mp-129', amount: 15000 };
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);
    // First findOne (the pre-save idempotency check) sees nothing; the
    // second (inside the catch block, after save() fails) sees the row the
    // other delivery already committed.
    repository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingPayment);
    const duplicateKeyError = Object.assign(new Error('Duplicate entry'), {
      code: 'ER_DUP_ENTRY',
    });
    repository.save.mockRejectedValueOnce(duplicateKeyError);

    const result = await service.createFromMercadoPago({
      mpPaymentId: 'mp-129',
      subscriptionId: 7,
      amount: 15000,
      termMonths: 1,
      payMethod: 'mercadopago',
    });

    expect(result).toBe(existingPayment);
    expect(repository.findOne).toHaveBeenCalledTimes(2);
  });

  it('re-throws a save() failure that is not a duplicate-key error', async () => {
    // The catch block must not swallow real failures — only the specific
    // duplicate-key shape triggers the recovery path.
    subscriptions = {
      findSubscription: jest.fn().mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
        plan,
      }),
      activate: jest.fn().mockResolvedValue(undefined),
      renew: jest.fn().mockResolvedValue(undefined),
    };
    await buildService(null);
    const genuineError = new Error('connection lost');
    repository.save.mockRejectedValueOnce(genuineError);

    await expect(
      service.createFromMercadoPago({
        mpPaymentId: 'mp-130',
        subscriptionId: 7,
        amount: 15000,
        termMonths: 1,
        payMethod: 'mercadopago',
      }),
    ).rejects.toBe(genuineError);
  });
});

describe('PaymentService.findAll', () => {
  let service: PaymentService;
  let paymentRepository: { findAndCount: jest.Mock };
  let users: { findUser: jest.Mock };

  const buildService = async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: getRepositoryToken(Payment),
          useValue: paymentRepository,
        },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: subscriptionService, useValue: {} },
        { provide: PlanService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  };

  it('attaches the recording admin name to a payment with registeredById', async () => {
    paymentRepository = {
      findAndCount: jest
        .fn()
        .mockResolvedValue([[{ id: 1, registeredById: 30111222 }], 1]),
    };
    users = {
      findUser: jest
        .fn()
        .mockResolvedValue({ id: 30111222, name: 'Ana', surname: 'Pérez' }),
    };
    await buildService();

    const result = await service.findAll({ limit: 25, offset: 0 });

    expect(result.items[0].registeredByName).toBe('Ana Pérez');
    expect(users.findUser).toHaveBeenCalledWith(30111222);
  });

  it('leaves registeredByName null for a payment with no recording admin', async () => {
    paymentRepository = {
      findAndCount: jest
        .fn()
        .mockResolvedValue([[{ id: 1, registeredById: null }], 1]),
    };
    users = { findUser: jest.fn() };
    await buildService();

    const result = await service.findAll({ limit: 25, offset: 0 });

    expect(result.items[0].registeredByName).toBeNull();
    expect(users.findUser).not.toHaveBeenCalled();
  });

  it('looks up each distinct admin only once', async () => {
    paymentRepository = {
      findAndCount: jest.fn().mockResolvedValue([
        [
          { id: 1, registeredById: 30111222 },
          { id: 2, registeredById: 30111222 },
        ],
        2,
      ]),
    };
    users = {
      findUser: jest
        .fn()
        .mockResolvedValue({ id: 30111222, name: 'Ana', surname: 'Pérez' }),
    };
    await buildService();

    await service.findAll({ limit: 25, offset: 0 });

    expect(users.findUser).toHaveBeenCalledTimes(1);
  });

  it('orders by date descending in SQL and applies the window', async () => {
    paymentRepository = {
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    users = { findUser: jest.fn() };
    await buildService();

    await service.findAll({ limit: 25, offset: 50 });
    expect(paymentRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deleted: false },
        order: { date: 'DESC' },
        take: 25,
        skip: 50,
      }),
    );
  });

  it('returns the total alongside the page', async () => {
    paymentRepository = {
      findAndCount: jest
        .fn()
        .mockResolvedValue([[{ id: 1, registeredById: null }], 137]),
    };
    users = { findUser: jest.fn() };
    await buildService();

    const result = await service.findAll({ limit: 25, offset: 0 });
    expect(result.total).toBe(137);
    expect(result.items).toHaveLength(1);
  });
});

describe('PaymentService.registerPlanPayment', () => {
  let service: PaymentService;
  let repository: { create: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock; find: jest.Mock };
  let subscriptions: { replaceActiveSubscription: jest.Mock };
  let plans: { findPlan: jest.Mock };
  let durations: { findByPlan: jest.Mock };
  let users: { findUser: jest.Mock };

  const dto = {
    userId: 5,
    planId: 2,
    months: 6,
    amount: 300,
    payMethod: 'efectivo',
  };

  beforeEach(async () => {
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
    };
    manager = {
      // Mirrors real TypeORM: manager.create(EntityClass, data) returns an
      // actual instance of EntityClass, not a plain object. The rollback
      // test below relies on `entity instanceof Payment` being true.
      create: jest.fn((entityClass: new () => object, data: object) =>
        Object.assign(new entityClass(), data),
      ),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
    };
    dataSource = {
      // Actually invokes the callback with the mock manager and returns its
      // promise as-is, so a callback rejection propagates out of
      // dataSource.transaction(...) exactly like TypeORM's real rollback.
      transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    subscriptions = {
      replaceActiveSubscription: jest.fn().mockResolvedValue({ id: 42 }),
    };
    plans = {
      findPlan: jest.fn().mockResolvedValue({
        id: 2,
        name: 'Premium',
        price: 100,
        numDays: 30,
        deleted: false,
      }),
    };
    durations = {
      findByPlan: jest.fn().mockResolvedValue([
        {
          id: 9,
          planId: 2,
          months: 6,
          numDays: 180,
          price: 300,
          deleted: false,
        },
      ]),
    };
    users = {
      findUser: jest.fn().mockResolvedValue({ id: 5, deleted: false }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: repository },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: plans },
        { provide: PlanDurationService, useValue: durations },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  });

  it('writes the subscription and the payment together', async () => {
    const payment = await service.registerPlanPayment(dto, 1);
    expect(subscriptions.replaceActiveSubscription).toHaveBeenCalled();
    // Not just "called" — called with the SAME manager instance the
    // transaction callback received, so the subscription write is genuinely
    // inside dataSource.transaction(...) rather than issued against some
    // other (non-transactional) manager that merely looks equivalent.
    expect(subscriptions.replaceActiveSubscription).toHaveBeenCalledWith(
      manager,
      expect.anything(),
    );
    expect(payment).toMatchObject({
      subscriptionId: 42,
      amount: 300,
      payMethod: 'efectivo',
      registeredById: 1,
      state: 'completado',
    });
  });

  it('leaves no subscription behind when the payment insert fails', async () => {
    // The finding-6 regression. This is the only test that proves the
    // transaction is real rather than decorative.
    manager.save.mockImplementation((entity: unknown) => {
      if (entity instanceof Payment) throw new Error('insert failed');
      return Promise.resolve(entity);
    });
    await expect(service.registerPlanPayment(dto, 1)).rejects.toThrow(
      'insert failed',
    );
    expect(dataSource.transaction).toHaveBeenCalled();
    // dataSource.transaction rethrows after rolling back; the mock asserts
    // the callback threw rather than swallowing.
    //
    // And critically: the subscription write went through the SAME manager
    // instance the transaction callback received. Without this, a future
    // regression that calls replaceActiveSubscription OUTSIDE
    // dataSource.transaction(...) — breaking the atomicity this task exists
    // to add — would still make every test in this file pass, since
    // manager.save's mock throws purely on `entity instanceof Payment`,
    // independent of which manager instance issued the subscription write.
    expect(subscriptions.replaceActiveSubscription).toHaveBeenCalledWith(
      manager,
      expect.anything(),
    );
  });

  it('refuses a deleted member', async () => {
    users.findUser.mockResolvedValue({ id: 5, deleted: true });
    await expect(service.registerPlanPayment(dto, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a deleted plan', async () => {
    plans.findPlan.mockResolvedValue(null);
    await expect(service.registerPlanPayment(dto, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses a duration the plan does not offer', async () => {
    durations.findByPlan.mockResolvedValue([]);
    await expect(service.registerPlanPayment(dto, 1)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('resolves the period itself and ignores anything the client sent', async () => {
    await service.registerPlanPayment({ ...dto, months: 6 }, 1);
    const [, input] = subscriptions.replaceActiveSubscription.mock.calls[0] as [
      unknown,
      { term: { numDays: number } },
    ];
    expect(input.term.numDays).toBe(180);
  });

  it('records the term it sold, not the column default', async () => {
    await service.registerPlanPayment(
      {
        userId: 3,
        planId: 12,
        months: 6,
        amount: 27000,
        payMethod: 'efectivo',
      },
      30111222,
    );

    expect(manager.create).toHaveBeenCalledWith(
      Payment,
      expect.objectContaining({ termMonths: 6, amount: 27000 }),
    );
  });
});

describe('PaymentService.confirmPlanCharge', () => {
  let service: PaymentService;
  let paymentRepository: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock };
  let subscriptions: {
    replaceActiveSubscription: jest.Mock;
    findSubscription: jest.Mock;
  };
  let plans: { findPlan: jest.Mock };
  let durations: { findByPlan: jest.Mock };
  let users: { findUser: jest.Mock };

  // What replaceActiveSubscription's manager.save(created) actually returns:
  // no user/plan, since TypeORM never runs eager relations for a plain
  // save(). Distinct object identity from the hydrated version below, so a
  // test asserting on the RETURNED subscription proves the hydrated one —
  // not this one — is what came back.
  const unhydratedSubscription = { id: 55 };
  // What findSubscription (a real findOne, which DOES run eager relations)
  // returns: the same row, now carrying user/plan.
  const hydratedSubscription = {
    id: 55,
    user: { email: 'a@b.c', name: 'Ana' },
    plan: { name: 'Trimestral' },
  };

  const input = {
    mpPaymentId: 'mp-1',
    userId: 3,
    planId: 12,
    months: 3,
    amount: 14000,
    payMethod: 'point',
    registeredById: 30111222,
  };

  beforeEach(async () => {
    paymentRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    manager = {
      create: jest.fn((entityClass: new () => object, data: object) =>
        Object.assign(new entityClass(), data),
      ),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    subscriptions = {
      replaceActiveSubscription: jest
        .fn()
        .mockResolvedValue(unhydratedSubscription),
      findSubscription: jest.fn().mockResolvedValue(hydratedSubscription),
    };
    plans = {
      findPlan: jest.fn().mockResolvedValue({
        id: 12,
        name: 'Trimestral',
        price: 5000,
        numDays: 30,
        deleted: false,
      }),
    };
    durations = {
      findByPlan: jest.fn().mockResolvedValue([
        {
          id: 20,
          planId: 12,
          months: 3,
          numDays: 90,
          price: 14000,
          deleted: false,
        },
      ]),
    };
    users = { findUser: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: plans },
        { provide: PlanDurationService, useValue: durations },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  });

  it('creates the subscription and the payment in one transaction', async () => {
    const result = await service.confirmPlanCharge(input);

    expect(subscriptions.replaceActiveSubscription).toHaveBeenCalledWith(
      manager,
      expect.objectContaining({ userId: 3, planId: 12, soldPrice: 14000 }),
    );
    expect(manager.create).toHaveBeenCalledWith(
      Payment,
      expect.objectContaining({
        mpPaymentId: 'mp-1',
        termMonths: 3,
        amount: 14000,
        payMethod: 'point',
      }),
    );
    expect(result.subscription).toBeDefined();
    expect(result.payment).toBeDefined();
  });

  // Regression guard for the receipt-email bug: replaceActiveSubscription
  // returns a plain manager.save() result, which TypeORM never populates
  // eager relations for. A test that merely mocks replaceActiveSubscription
  // to already return a fully-hydrated { user, plan } object — as this file
  // used to — would pass even if the real code never re-fetched anything, and
  // that is exactly how this bug shipped. Asserting the DISTINCT hydrated
  // object came back, and that findSubscription was actually called with the
  // id the transaction produced, exercises the real hydration call rather
  // than assuming it.
  it("hydrates the returned subscription's user/plan after the transaction commits", async () => {
    const result = await service.confirmPlanCharge(input);

    expect(subscriptions.findSubscription).toHaveBeenCalledWith(55);
    expect(result.subscription).toBe(hydratedSubscription);
    expect(result.subscription).not.toBe(unhydratedSubscription);
    expect(result.subscription.user).toEqual({
      email: 'a@b.c',
      name: 'Ana',
    });
    expect(result.subscription.plan).toEqual({ name: 'Trimestral' });
  });

  it('fails loudly if the just-created subscription cannot be re-fetched', async () => {
    // Should never happen in practice — the row was written moments earlier
    // in the same request — but a null here must not silently hand the
    // caller an under-hydrated subscription; that is the exact bug this
    // hydration step exists to close.
    subscriptions.findSubscription.mockResolvedValue(null);

    await expect(service.confirmPlanCharge(input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('is idempotent on mpPaymentId', async () => {
    paymentRepository.findOne.mockResolvedValue({
      id: 99,
      mpPaymentId: 'mp-1',
    });

    const result = await service.confirmPlanCharge(input);

    expect(result.payment.id).toBe(99);
    expect(subscriptions.replaceActiveSubscription).not.toHaveBeenCalled();
  });

  it('rejects a plan that does not exist', async () => {
    plans.findPlan.mockResolvedValue(null);

    await expect(service.confirmPlanCharge(input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('persists mpOrderId on the payment when the caller supplies one', async () => {
    // (Reuse whatever plan/duration/subscription mocks the surrounding
    // describe block's beforeEach already sets up for a successful charge —
    // this test only adds the new field and reads it back off the saved row.)
    const { payment } = await service.confirmPlanCharge({
      mpPaymentId: 'mp-1',
      userId: 3,
      planId: 12,
      months: 1,
      amount: 19995,
      payMethod: 'mercadopago',
      mpOrderId: 'ORD01',
    });

    expect(payment.mpOrderId).toBe('ORD01');
  });
});

describe('confirmPlanCharge for a prorated upgrade', () => {
  let service: PaymentService;
  let paymentRepository: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let manager: { create: jest.Mock; save: jest.Mock };
  let subscriptions: {
    replaceActiveSubscription: jest.Mock;
    findSubscription: jest.Mock;
  };
  let plans: { findPlan: jest.Mock };
  let durations: { findByPlan: jest.Mock };
  let users: { findUser: jest.Mock };

  // What findSubscription (a real findOne, which DOES run eager relations)
  // returns after the transaction commits — same hydration step
  // confirmPlanCharge already exercises in the term-mode describe block above.
  const hydratedSubscription = {
    id: 11,
    user: { email: 'a@b.c', name: 'Ana' },
    plan: { name: 'Premium' },
  };

  beforeEach(async () => {
    paymentRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    manager = {
      create: jest.fn((entityClass: new () => object, data: object) =>
        Object.assign(new entityClass(), data),
      ),
      save: jest.fn((entity: unknown) => Promise.resolve(entity)),
    };
    dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    subscriptions = {
      replaceActiveSubscription: jest.fn().mockResolvedValue({ id: 11 }),
      findSubscription: jest.fn().mockResolvedValue(hydratedSubscription),
    };
    plans = {
      // Premium's regular monthly price is 9000 — soldPrice on a prorated row
      // must record this, never the 6100 actually collected.
      findPlan: jest.fn().mockResolvedValue({
        id: 2,
        name: 'Premium',
        price: 9000,
        numDays: 30,
        deleted: false,
      }),
    };
    durations = { findByPlan: jest.fn().mockResolvedValue([]) };
    users = { findUser: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: paymentRepository },
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: plans },
        { provide: PlanDurationService, useValue: durations },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  });

  it('keeps the replaced end date and records the plan monthly price as soldPrice', async () => {
    // soldPrice is what estimatedMrr divides. Recording the 6100 actually
    // collected would report this member at 6100/month instead of 9000.
    await service.confirmPlanCharge({
      mpPaymentId: 'mp-1',
      userId: 7,
      planId: 2,
      months: 0,
      amount: 6100,
      payMethod: 'mercadopago',
      changeFromSubscriptionId: 10,
      endDateOverride: '2026-03-31' as unknown as Date,
    });

    expect(subscriptions.replaceActiveSubscription).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        planId: 2,
        soldPrice: 9000,
        endDate: '2026-03-31',
        changedFromSubscriptionId: 10,
      }),
    );
  });

  it('records termMonths 0, because a prorated adjustment buys no months', async () => {
    await service.confirmPlanCharge({
      mpPaymentId: 'mp-2',
      userId: 7,
      planId: 2,
      months: 0,
      amount: 6100,
      payMethod: 'mercadopago',
      changeFromSubscriptionId: 10,
      endDateOverride: '2026-03-31' as unknown as Date,
    });

    expect(manager.create).toHaveBeenCalledWith(
      Payment,
      expect.objectContaining({
        amount: 6100,
        termMonths: 0,
        monthlyPriceAtPurchase: 9000,
      }),
    );
  });

  it('stays idempotent, as Mercado Pago retries a notification up to eight times', async () => {
    service.findByMpPaymentId = jest
      .fn()
      .mockResolvedValue({ id: 99, subscription: { id: 11 } });

    const result = await service.confirmPlanCharge({
      mpPaymentId: 'mp-1',
      userId: 7,
      planId: 2,
      months: 0,
      amount: 6100,
      payMethod: 'mercadopago',
      changeFromSubscriptionId: 10,
      endDateOverride: '2026-03-31' as unknown as Date,
    });

    expect(result.payment.id).toBe(99);
    expect(subscriptions.replaceActiveSubscription).not.toHaveBeenCalled();
  });
});

describe('PaymentService.createFailedPayment', () => {
  let service: PaymentService;
  let repository: { create: jest.Mock; save: jest.Mock };
  let subscriptions: {
    findSubscription: jest.Mock;
    activate: jest.Mock;
    renew: jest.Mock;
  };
  let users: { findUser: jest.Mock };

  const dto = {
    subscriptionId: 7,
    amount: 15000,
    payMethod: 'mercadopago',
    termMonths: 1,
    monthlyPriceAtPurchase: 15000,
  };

  const buildService = async () => {
    repository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
    };
    subscriptions = {
      findSubscription: jest.fn(),
      activate: jest.fn(),
      renew: jest.fn(),
    };
    users = { findUser: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: getRepositoryToken(Payment), useValue: repository },
        { provide: getDataSourceToken(), useValue: {} },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: PlanService, useValue: {} },
        { provide: PlanDurationService, useValue: {} },
        { provide: UserService, useValue: users },
      ],
    }).compile();

    service = moduleRef.get(PaymentService);
  };

  // The renewal cron's decline path: a standalone FAILED row for the
  // record, with none of createManualPayment/createFromMercadoPago's
  // subscription-promoting logic — a decline must leave the subscription
  // exactly as it was.
  it('writes a standalone FAILED row without touching the subscription', async () => {
    await buildService();

    const result = await service.createFailedPayment(dto);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 7,
        amount: 15000,
        payMethod: 'mercadopago',
        state: PaymentState.FAILED,
        registeredById: null,
        termMonths: 1,
        monthlyPriceAtPurchase: 15000,
        deleted: false,
      }),
    );
    expect(repository.save).toHaveBeenCalled();
    expect(subscriptions.findSubscription).not.toHaveBeenCalled();
    expect(subscriptions.activate).not.toHaveBeenCalled();
    expect(subscriptions.renew).not.toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({ id: 1, state: PaymentState.FAILED }),
    );
  });
});
