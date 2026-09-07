import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import { subscriptionService } from './subscription.service';
import { Subscription } from './entity/subscription.entity';
import { SubscriptionState } from './enum/subscription-state.enum';
import { PlanService } from '../plan/plan.service';
import { UserService } from '../user/user.service';
import { toDateOnly } from './subscription.rules';

// Local date parts, matching the 'YYYY-MM-DD' the service writes. Spelled out
// here rather than imported so the assertions do not check the helper against
// itself.
function localDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

// `today`/`tomorrow`/`yesterday` in replaceActiveSubscription's tests are
// computed relative to the real clock so the suite is not tied to a
// hardcoded date. toDateOnly is imported from production rather than
// redefined here (it used to be a UTC-based local helper) so the fixtures
// agree with the local-time logic under test by construction, not by
// coincidence of timezone/time-of-day.
const addDays = (base: Date, days: number) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

// The shape manager.create is invoked with in replaceActiveSubscription,
// spelled out so `.mock.calls[0][1]` reads back as something other than
// `any`.
interface CreatedSubscriptionPayload {
  startDate: string;
  endDate: string;
  planDurationId?: number | null;
  soldPrice?: number | null;
  state?: string;
}

// The shape `find` is invoked with in findDueForRenewal, spelled out so
// `.mock.calls[0][0]` reads back as something other than `any`.
interface FindDueForRenewalQuery {
  where: { state: SubscriptionState };
}

describe('subscriptionService', () => {
  let service: subscriptionService;
  let subscriptionRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock<Promise<unknown[]>, [FindDueForRenewalQuery]>;
  };
  let manager: {
    find: jest.Mock;
    save: jest.Mock;
    create: jest.Mock<
      CreatedSubscriptionPayload,
      [unknown, CreatedSubscriptionPayload]
    >;
  };
  let planService: {
    findPlan: jest.Mock;
    findPlanIncludingDeleted: jest.Mock;
  };

  beforeEach(async () => {
    subscriptionRepository = {
      create: jest.fn((entity: object) => entity),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest
        .fn<Promise<unknown[]>, [FindDueForRenewalQuery]>()
        .mockResolvedValue([]),
    };
    manager = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn((entity: object) => Promise.resolve({ id: 1, ...entity })),
      create: jest.fn(
        (_entity: unknown, data: CreatedSubscriptionPayload) => data,
      ),
    };
    planService = {
      findPlan: jest
        .fn()
        .mockResolvedValue({ id: 1, numDays: 30, deleted: false }),
      findPlanIncludingDeleted: jest
        .fn()
        .mockResolvedValue({ id: 1, numDays: 30, deleted: false }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        subscriptionService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: subscriptionRepository,
        },
        {
          provide: PlanService,
          useValue: planService,
        },
        { provide: UserService, useValue: {} },
        {
          provide: getDataSourceToken(),
          useValue: {
            transaction: jest.fn((cb: (manager: unknown) => unknown) =>
              cb(manager),
            ),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(subscriptionService);
  });

  describe('changePlan', () => {
    it('opens a self-service plan change as PENDING, not ACTIVE', async () => {
      await service.changePlan(30111222, 1, false);
      expect(manager.create).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ state: SubscriptionState.PENDING }),
      );
    });

    it('still opens an admin-assigned plan as ACTIVE', async () => {
      await service.changePlan(30111222, 1, true);
      expect(manager.create).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ state: SubscriptionState.ACTIVE }),
      );
    });

    it('does not cancel the current plan when a self-service change is requested', async () => {
      const currentActive = {
        id: 1,
        userId: 30111222,
        planId: 5,
        state: SubscriptionState.ACTIVE,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(currentActive) // the current ACTIVE row
        .mockResolvedValueOnce(null); // no PENDING row on the target plan

      await service.changePlan(30111222, 9, false);

      expect(currentActive.state).toBe(SubscriptionState.ACTIVE);
      expect(subscriptionRepository.save).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, state: SubscriptionState.CANCELLED }),
      );
    });

    it('still cancels the current plan immediately for an admin-assigned change', async () => {
      const currentActive = {
        id: 1,
        userId: 30111222,
        planId: 5,
        state: SubscriptionState.ACTIVE,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(currentActive) // the current ACTIVE row
        .mockResolvedValueOnce(null); // no PENDING row on the target plan

      await service.changePlan(30111222, 9, true);

      expect(currentActive.state).toBe(SubscriptionState.CANCELLED);
    });

    it('refuses a second change to a plan already pending payment', async () => {
      const pendingSamePlan = {
        id: 4,
        userId: 30111222,
        planId: 9,
        state: SubscriptionState.PENDING,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(null) // no ACTIVE row
        .mockResolvedValueOnce(pendingSamePlan); // one already pending

      await expect(service.changePlan(30111222, 9, false)).rejects.toThrow(
        ConflictException,
      );
      expect(subscriptionRepository.create).not.toHaveBeenCalled();
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });

    it('does not cancel the current plan when the change is refused', async () => {
      const currentActive = {
        id: 1,
        userId: 30111222,
        planId: 5,
        state: SubscriptionState.ACTIVE,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(currentActive)
        .mockResolvedValueOnce({
          id: 4,
          userId: 30111222,
          planId: 9,
          state: SubscriptionState.PENDING,
        });

      await expect(service.changePlan(30111222, 9, true)).rejects.toThrow(
        ConflictException,
      );
      expect(currentActive.state).toBe(SubscriptionState.ACTIVE);
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('activate', () => {
    it('promotes a PENDING subscription to ACTIVE', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 7,
        state: SubscriptionState.PENDING,
        deleted: false,
      });

      await service.activate(7, 30);

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, state: SubscriptionState.ACTIVE }),
      );
    });

    it('rejects an id that does not exist', async () => {
      await expect(service.activate(404, 30)).rejects.toThrow(
        'La suscripción con ID: 404 no existe.',
      );
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });

    it('cancels the previously active subscription when activating a new one', async () => {
      const target = {
        id: 2,
        userId: 30111222,
        state: SubscriptionState.PENDING,
      };
      const previousActive = {
        id: 1,
        userId: 30111222,
        state: SubscriptionState.ACTIVE,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(target) // findSubscription(id) inside activate
        .mockResolvedValueOnce(previousActive); // the lookup for the old ACTIVE row

      await service.activate(2, 30);

      expect(previousActive.state).toBe(SubscriptionState.CANCELLED);
      expect(target.state).toBe(SubscriptionState.ACTIVE);
    });

    it("recomputes the period from today, not the row's stale dates", async () => {
      const stale = {
        id: 7,
        userId: 30111222,
        planId: 1,
        state: SubscriptionState.PENDING,
        startDate: '2025-01-10',
        endDate: '2025-02-09',
        deleted: false,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(stale) // findSubscription(id) inside activate
        .mockResolvedValueOnce(null); // no previously active row

      await service.activate(7, 30);

      const today = new Date();
      const in30Days = new Date(today);
      in30Days.setDate(in30Days.getDate() + 30);

      expect(stale.startDate).toBe(localDate(today));
      expect(stale.endDate).toBe(localDate(in30Days));
      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          state: SubscriptionState.ACTIVE,
          startDate: localDate(today),
          endDate: localDate(in30Days),
        }),
      );
    });

    it("honors a multi-month term (90 days), not just the plan's 1-month numDays", async () => {
      const stale = {
        id: 7,
        userId: 30111222,
        planId: 1,
        state: SubscriptionState.PENDING,
        startDate: '2025-01-10',
        endDate: '2025-02-09',
        deleted: false,
      };
      subscriptionRepository.findOne
        .mockResolvedValueOnce(stale) // findSubscription(id) inside activate
        .mockResolvedValueOnce(null); // no previously active row

      // Represents a 3-month term at plan.numDays: 30 (termMonths * plan.numDays).
      await service.activate(7, 90);

      const today = new Date();
      const in90Days = new Date(today);
      in90Days.setDate(in90Days.getDate() + 90);

      expect(stale.startDate).toBe(localDate(today));
      expect(stale.endDate).toBe(localDate(in90Days));
      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 7,
          state: SubscriptionState.ACTIVE,
          startDate: localDate(today),
          endDate: localDate(in90Days),
        }),
      );
    });

    it('activates a payment against a plan the admin has since retired', async () => {
      subscriptionRepository.findOne
        .mockResolvedValueOnce({
          id: 7,
          planId: 1,
          state: SubscriptionState.PENDING,
          deleted: false,
        })
        .mockResolvedValueOnce(null); // no previously active row
      planService.findPlanIncludingDeleted.mockResolvedValue({
        id: 1,
        numDays: 30,
        deleted: true,
      });

      await expect(service.activate(7, 30)).resolves.toBeDefined();
      expect(planService.findPlanIncludingDeleted).toHaveBeenCalledWith(1);
      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, state: SubscriptionState.ACTIVE }),
      );
    });
  });

  describe('replaceActiveSubscription', () => {
    const term = { months: 6, numDays: 180, price: 300, planDurationId: 7 };
    const today = new Date();

    it('cancels every live subscription, ACTIVE and PENDING alike', async () => {
      manager.find.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          planId: 2,
          state: 'activa',
          endDate: toDateOnly(today),
        },
        { id: 2, userId: 5, planId: 3, state: 'pendiente' },
      ]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, state: 'cancelada' }),
      );
      expect(manager.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, state: 'cancelada' }),
      );
    });

    it('allows renewing the same plan, which changePlan refuses', async () => {
      manager.find.mockResolvedValue([
        {
          id: 1,
          userId: 5,
          planId: 2,
          state: 'activa',
          endDate: toDateOnly(today),
        },
      ]);
      await expect(
        service.replaceActiveSubscription(manager, {
          userId: 5,
          planId: 2,
          term,
          soldPrice: term.price,
        }),
      ).resolves.toBeDefined();
    });

    it('takes the period length from the resolved term, not from the plan', async () => {
      manager.find.mockResolvedValue([]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      expect(manager.create).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ planDurationId: 7, state: 'activa' }),
      );
      const created = manager.create.mock.calls[0][1];
      const days =
        (new Date(created.endDate).getTime() -
          new Date(created.startDate).getTime()) /
        86_400_000;
      expect(days).toBe(180);
    });

    it('snapshots the resolved term price onto the subscription as soldPrice', async () => {
      manager.find.mockResolvedValue([]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      expect(manager.create).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ soldPrice: term.price }),
      );
    });

    it('records the charged amount as soldPrice, not the list price', async () => {
      await service.replaceActiveSubscription(
        manager as unknown as EntityManager,
        {
          userId: 3,
          planId: 12,
          term: { months: 3, numDays: 90, price: 15000, planDurationId: 55 },
          soldPrice: 14000,
        },
      );

      expect(manager.create).toHaveBeenCalledWith(
        Subscription,
        expect.objectContaining({ soldPrice: 14000, planDurationId: 55 }),
      );
    });

    it('extends from the day after the current ACTIVE endDate when it has not passed', async () => {
      const endDate = toDateOnly(addDays(today, 3)); // still current
      manager.find.mockResolvedValue([
        { id: 1, userId: 5, planId: 2, state: 'activa', endDate },
      ]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      const created = manager.create.mock.calls[0][1];
      // created.startDate is already a 'YYYY-MM-DD' string (subscriptionPeriod's
      // output, cast to Date only for TypeORM's benefit) — compared directly
      // rather than round-tripped through `new Date(created.startDate)`, which
      // parses a date-only string as UTC midnight and would shift it back a
      // day once reformatted with the local-time toDateOnly, the exact trap
      // dayAfter exists to avoid.
      expect(created.startDate).toBe(toDateOnly(addDays(today, 4)));
    });

    it('starts today when the ACTIVE subscription already lapsed', async () => {
      const endDate = toDateOnly(addDays(today, -2)); // already expired
      manager.find.mockResolvedValue([
        { id: 1, userId: 5, planId: 2, state: 'activa', endDate },
      ]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      const created = manager.create.mock.calls[0][1];
      // Compared directly as a string — see the comment above.
      expect(created.startDate).toBe(toDateOnly(today));
    });

    it('starts today when there is no ACTIVE subscription to extend from', async () => {
      manager.find.mockResolvedValue([
        { id: 2, userId: 5, planId: 3, state: 'pendiente' },
      ]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      const created = manager.create.mock.calls[0][1];
      // Compared directly as a string — see the comment above.
      expect(created.startDate).toBe(toDateOnly(today));
    });

    it('uses the passed manager and never its own repository', async () => {
      manager.find.mockResolvedValue([]);
      await service.replaceActiveSubscription(manager, {
        userId: 5,
        planId: 2,
        term,
        soldPrice: term.price,
      });
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('renew', () => {
    it('extends the endDate from its current value, not from today', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 3,
        userDni: 30111222,
        endDate: '2026-09-30',
        state: SubscriptionState.ACTIVE,
      });

      await service.renew(3, 30);

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, endDate: '2026-10-30' }),
      );
    });

    it('sets the state back to ACTIVE, lifting a subscription the nightly sweep marked INACTIVE', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 3,
        userDni: 30111222,
        endDate: '2026-09-30',
        state: SubscriptionState.INACTIVE,
      });

      await service.renew(3, 30);

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3, state: SubscriptionState.ACTIVE }),
      );
    });

    it('rejects an id that does not exist', async () => {
      await expect(service.renew(404, 30)).rejects.toThrow(
        'La suscripción con ID: 404 no existe.',
      );
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });

    it("does not cancel the member's other subscriptions", async () => {
      // Unlike activate, renew never looks up a previously-active row to
      // cancel — the only findOne call is findSubscription's own lookup of
      // the row being renewed.
      subscriptionRepository.findOne.mockResolvedValue({
        id: 3,
        userDni: 30111222,
        endDate: '2026-09-30',
        state: SubscriptionState.ACTIVE,
      });

      await service.renew(3, 30);

      expect(subscriptionRepository.findOne).toHaveBeenCalledTimes(1);
      expect(subscriptionRepository.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('renew with a scheduled downgrade', () => {
    it('opens the next term on the scheduled plan and clears the field', async () => {
      const sub = {
        id: 10,
        planId: 2,
        scheduledPlanId: 1,
        endDate: '2026-03-31',
        state: SubscriptionState.ACTIVE,
      };
      service.findSubscription = jest.fn().mockResolvedValue(sub);

      await service.renew(10, 30);

      expect(sub.planId).toBe(1);
      expect(sub.scheduledPlanId).toBeNull();
      expect(sub.endDate).toBe('2026-04-30');
    });

    it('resets the term pricing fields, since the new term is a different plan', async () => {
      // Leaving soldPrice and planDurationId from the old plan would report the
      // member at the old plan's MRR for the whole new term.
      const sub = {
        id: 10,
        planId: 2,
        scheduledPlanId: 1,
        endDate: '2026-03-31',
        state: SubscriptionState.ACTIVE,
        soldPrice: 9000,
        planDurationId: 4,
      };
      service.findSubscription = jest.fn().mockResolvedValue(sub);
      planService.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        deleted: false,
      });

      await service.renew(10, 30);

      expect(sub.soldPrice).toBe(6000);
      expect(sub.planDurationId).toBeNull();
    });

    it('leaves a subscription with no scheduled change exactly as it was', async () => {
      const sub = {
        id: 10,
        planId: 2,
        scheduledPlanId: null,
        endDate: '2026-03-31',
        state: SubscriptionState.ACTIVE,
      };
      service.findSubscription = jest.fn().mockResolvedValue(sub);

      await service.renew(10, 30);

      expect(sub.planId).toBe(2);
    });
  });

  describe('findDueForRenewal', () => {
    it('queries autoRenew, ACTIVE, non-deleted subscriptions ending on one of the given dates', async () => {
      const dueDates = ['2026-09-11', '2026-09-12', '2026-09-13'];

      await service.findDueForRenewal(dueDates);

      expect(subscriptionRepository.find).toHaveBeenCalledWith({
        where: {
          autoRenew: true,
          state: SubscriptionState.ACTIVE,
          deleted: false,
          endDate: In(dueDates),
        },
        relations: { plan: true, user: true },
      });
    });

    it('never selects a PAUSED subscription for charging', async () => {
      await service.findDueForRenewal(['2026-09-11']);

      const call = subscriptionRepository.find.mock.calls[0][0];
      expect(call.where.state).toBe(SubscriptionState.ACTIVE);
      expect(call.where.state).not.toBe(SubscriptionState.PAUSED);
    });
  });

  describe('findChangeContext', () => {
    it('reports the row as unchanged when it was never changed from another', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 10,
        state: 'activa',
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        changedFromSubscriptionId: null,
        plan: { id: 1, price: 6000, numDays: 30 },
      });

      const context = await service.findChangeContext(7);

      expect(context?.current).toEqual({
        plan: { id: 1, price: 6000, numDays: 30 },
        state: 'activa',
        termStartDate: '2026-01-01',
        endDate: '2026-03-31',
        alreadyChanged: false,
      });
    });

    it('reads the ORIGINAL term start through changedFromSubscriptionId', async () => {
      // The upgraded row started today; the lock must still measure from 01/01,
      // or an upgrade would reset its own 30-day lock.
      subscriptionRepository.findOne
        .mockResolvedValueOnce({
          id: 11,
          state: 'activa',
          startDate: '2026-02-15',
          endDate: '2026-03-31',
          changedFromSubscriptionId: 10,
          plan: { id: 2, price: 9000, numDays: 30 },
        })
        .mockResolvedValueOnce({ id: 10, startDate: '2026-01-01' });

      const context = await service.findChangeContext(7);

      expect(context?.current.termStartDate).toBe('2026-01-01');
      expect(context?.current.alreadyChanged).toBe(true);
    });

    it('returns null when the member has no live subscription', async () => {
      subscriptionRepository.findOne.mockResolvedValue(null);
      expect(await service.findChangeContext(7)).toBeNull();
    });
  });

  describe('replaceActiveSubscription with an inherited end date', () => {
    it('keeps the end date it is given instead of opening a fresh term', async () => {
      const manager = {
        find: jest.fn().mockResolvedValue([
          { id: 10, state: 'activa', endDate: '2026-03-31', scheduledPlanId: 5 },
        ]),
        create: jest.fn(
          (_entity: unknown, data: CreatedSubscriptionPayload) => data,
        ),
        save: jest.fn((row) => Promise.resolve({ id: 11, ...row })),
      } as unknown as EntityManager;

      const created = await service.replaceActiveSubscription(manager, {
        userId: 7,
        planId: 2,
        term: { months: 1, numDays: 30, price: 9000, planDurationId: null },
        soldPrice: 9000,
        endDate: '2026-03-31' as unknown as Date,
        changedFromSubscriptionId: 10,
      });

      expect(created).toMatchObject({
        endDate: '2026-03-31',
        changedFromSubscriptionId: 10,
        planDurationId: null,
      });
    });

    it('clears a scheduled downgrade on the row it replaces', async () => {
      // The member paid to upgrade; a downgrade they scheduled earlier must not
      // survive onto the plan they just bought.
      const cancelled = {
        id: 10, state: 'activa', endDate: '2026-03-31', scheduledPlanId: 5,
      };
      const manager = {
        find: jest.fn().mockResolvedValue([cancelled]),
        create: jest.fn(
          (_entity: unknown, data: CreatedSubscriptionPayload) => data,
        ),
        save: jest.fn((row) => Promise.resolve(row)),
      } as unknown as EntityManager;

      await service.replaceActiveSubscription(manager, {
        userId: 7,
        planId: 2,
        term: { months: 1, numDays: 30, price: 9000, planDurationId: null },
        soldPrice: 9000,
        endDate: '2026-03-31' as unknown as Date,
        changedFromSubscriptionId: 10,
      });

      expect(cancelled.scheduledPlanId).toBeNull();
    });
  });

  describe('setAutoRenew', () => {
    it('flips autoRenew on the subscription and saves it', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 7,
        userId: 30111222,
        autoRenew: false,
      });

      await service.setAutoRenew(7, true);

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, autoRenew: true }),
      );
    });

    it('turns autoRenew off just as unconditionally as it turns it on', async () => {
      subscriptionRepository.findOne.mockResolvedValue({
        id: 7,
        userId: 30111222,
        autoRenew: true,
      });

      await service.setAutoRenew(7, false);

      expect(subscriptionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 7, autoRenew: false }),
      );
    });

    it('throws when the subscription does not exist', async () => {
      subscriptionRepository.findOne.mockResolvedValue(null);

      await expect(service.setAutoRenew(999, true)).rejects.toThrow(
        'La suscripción con ID: 999 no existe.',
      );
      expect(subscriptionRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('applyPlanChange', () => {
    // Pinned to Jan 31, 2026, same as the identical fixtures in
    // checkout.service.spec.ts: 30 days after termStartDate (past the lock)
    // and 60 days before endDate (past the too-close-to-end floor). Without
    // pinning, applyPlanChange's `today: toDateOnly(new Date())` reads the
    // real clock, and the moment the real date passes endDate every one of
    // these fixtures starts reading as 'too_close_to_end' instead of the
    // branch under test.
    it('schedules a downgrade without touching the current term', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      const live = {
        id: 10,
        planId: 2,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: null,
      };
      service.findChangeContext = jest.fn().mockResolvedValue({
        subscription: live,
        current: {
          plan: { id: 2, price: 9000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      planService.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        name: 'Basic',
      });

      const result = await service.applyPlanChange(7, 1);

      expect(result.direction).toBe('downgrade');
      expect(live.scheduledPlanId).toBe(1);
      expect(live.planId).toBe(2); // current plan untouched
      expect(live.endDate).toBe('2026-03-31');
      jest.useRealTimers();
    });

    it('applies a lateral move immediately', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      const live = {
        id: 10,
        planId: 2,
        // Non-null on purpose: proves the assertion below is checking a
        // real reset, not a fixture that started out null already.
        planDurationId: 55,
        soldPrice: 8500,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: null,
      };
      service.findChangeContext = jest.fn().mockResolvedValue({
        subscription: live,
        current: {
          plan: { id: 2, price: 9000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      // 13500 over 45 days is 300/day, the same daily rate as 9000 over 30.
      planService.findPlan.mockResolvedValue({
        id: 4,
        price: 13500,
        numDays: 45,
        name: 'Flex',
      });

      const result = await service.applyPlanChange(7, 4);

      expect(result.direction).toBe('lateral');
      expect(live.planId).toBe(4);
      expect(live.scheduledPlanId).toBeNull();
      expect(live.endDate).toBe('2026-03-31');
      // Final-review Important finding: planDurationId still pointed at the
      // OLD plan's duration row after a lateral move, even though the
      // subscription now claims a different plan.
      expect(live.planDurationId).toBeNull();
      // soldPrice must be rewritten to the new plan's regular monthly price:
      // leaving the old multi-month total in place with planDurationId now
      // null would overstate estimatedMrr (which falls back to dividing by 1
      // month when planDurationId is null) by however many months the old
      // term covered.
      expect(live.soldPrice).toBe(13500);
      jest.useRealTimers();
    });

    it('refuses an upgrade, which must be paid for', async () => {
      // An upgrade reaching this free route would grant a dearer plan for
      // nothing. This is the security boundary of the whole feature.
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      const live = {
        id: 10,
        planId: 1,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: null,
      };
      service.findChangeContext = jest.fn().mockResolvedValue({
        subscription: live,
        current: {
          plan: { id: 1, price: 6000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      planService.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      await expect(service.applyPlanChange(7, 2)).rejects.toThrow(
        'Mejorar de plan tiene un costo. Completá el pago para aplicarlo.',
      );
      expect(live.planId).toBe(1);
      expect(live.scheduledPlanId).toBeNull();
      jest.useRealTimers();
    });

    it('refuses with the Spanish reason when the term is still locked', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 10));
      const live = {
        id: 10,
        planId: 2,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: null,
      };
      service.findChangeContext = jest.fn().mockResolvedValue({
        subscription: live,
        current: {
          plan: { id: 2, price: 9000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      planService.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        name: 'Basic',
      });

      await expect(service.applyPlanChange(7, 1)).rejects.toThrow(
        'Podés cambiar de plan a partir del 31/01/2026.',
      );
      expect(live.scheduledPlanId).toBeNull();
      jest.useRealTimers();
    });
  });

  describe('cancelScheduledPlanChange', () => {
    it('clears the scheduled plan', async () => {
      const live = {
        id: 10,
        planId: 2,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: 1,
      };
      service.findChangeContext = jest
        .fn()
        .mockResolvedValue({ subscription: live, current: {} });
      service.findSubscription = jest.fn().mockResolvedValue(live);

      await service.cancelScheduledPlanChange(7);

      expect(live.scheduledPlanId).toBeNull();
      expect(subscriptionRepository.save).toHaveBeenCalledWith(live);
    });

    it('404s when nothing is scheduled', async () => {
      const live = {
        id: 10,
        planId: 2,
        endDate: '2026-03-31',
        state: 'activa',
        scheduledPlanId: null,
      };
      service.findChangeContext = jest
        .fn()
        .mockResolvedValue({ subscription: live, current: {} });

      await expect(service.cancelScheduledPlanChange(7)).rejects.toThrow(
        'No tenés un cambio de plan programado.',
      );
    });

    it('404s when the member has no live subscription at all', async () => {
      service.findChangeContext = jest.fn().mockResolvedValue(null);

      await expect(service.cancelScheduledPlanChange(7)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
