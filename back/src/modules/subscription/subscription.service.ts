import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  LessThan,
  Repository,
  UpdateResult,
} from 'typeorm';
import { SubscriptionDto } from './dto/subscription-dto';
import { Subscription } from './entity/subscription.entity';
import { SubscriptionState } from './enum/subscription-state.enum';
import { PlanService } from '../plan/plan.service';
import { UserService } from '../user/user.service';
import { ResolvedTerm } from '../plan/plan-duration.rules';
import type { CurrentTerm } from './plan-change.rules';
import {
  assessChange,
  blockMessage,
  PLAN_CHANGE_LOCK_DAYS,
} from './plan-change.rules';
import {
  addDays,
  dayAfter,
  isCurrentOn,
  renewalPeriod,
  subscriptionPeriod,
  toDateOnly,
} from './subscription.rules';

@Injectable()
export class subscriptionService {
  constructor(
    @InjectRepository(Subscription)
    private subscriptionRepository: Repository<Subscription>,
    private readonly planService: PlanService,
    private readonly userService: UserService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  // Moves the authenticated user to another plan: closes the active
  // subscription, if there is one, and opens a new one on the chosen plan. This
  // is not a payment — the charge is settled separately (in person for now,
  // through Mercado Pago later); see specs.md §2.3. Because of that, a
  // self-service change opens the new subscription PENDING and an admin
  // recording the payment is what activates it: otherwise anyone could register
  // and grant themselves an active plan for free.
  async changePlan(userId: number, planId: number, byAdmin = false) {
    const plan = await this.planService.findPlan(planId);
    if (!plan || plan.deleted) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    const currentActive = await this.subscriptionRepository.findOne({
      where: {
        userId,
        state: SubscriptionState.ACTIVE,
        deleted: false,
      },
    });

    // A self-service change stays PENDING until an admin records its payment,
    // and nothing used to stop a member from asking for the same plan again
    // and again: every call opened one more PENDING row, unbounded, and any of
    // them could later be activated. One outstanding request per plan is all
    // the flow needs — to settle an existing one, record its payment against
    // it rather than opening another.
    const pendingSamePlan = await this.subscriptionRepository.findOne({
      where: {
        userId,
        planId,
        state: SubscriptionState.PENDING,
        deleted: false,
      },
    });

    // Both duplicate checks run before anything is written, so a rejected
    // change cannot leave the member's current plan already cancelled.
    if (currentActive && currentActive.planId === planId) {
      throw new ConflictException(
        byAdmin
          ? 'El socio ya está suscripto a este plan.'
          : 'Ya estás suscripto a este plan.',
      );
    }

    if (pendingSamePlan) {
      throw new ConflictException(
        byAdmin
          ? 'El socio ya tiene un cambio a este plan pendiente de pago.'
          : 'Ya tenés un cambio a este plan pendiente de pago.',
      );
    }

    // The front-desk path is supervised and swaps the plan on the spot; the
    // self-service path keeps the member's current access until the new plan's
    // payment is recorded — see `activate`, which cancels the old ACTIVE
    // subscription once the new one is paid, not before.
    const period = subscriptionPeriod(plan.numDays);

    // Both writes in one unit of work: before this, a failure between them left
    // the member with their previous plan cancelled and no replacement.
    const saved = await this.dataSource.transaction(async (manager) => {
      if (currentActive && byAdmin) {
        currentActive.state = SubscriptionState.CANCELLED;
        await manager.save(currentActive);
      }
      const newSubscription = manager.create(Subscription, {
        userId,
        planId,
        ...period,
        // A self-service change opens PENDING: it only becomes ACTIVE once an
        // admin records the payment (see PaymentService.createManualPayment).
        // The front-desk path goes through assignPlanToMember, which is
        // staff-supervised, so it keeps activating on the spot.
        state: byAdmin ? SubscriptionState.ACTIVE : SubscriptionState.PENDING,
        deleted: false,
      });
      return manager.save(newSubscription);
    });

    return this.findSubscription(saved.id);
  }

  /**
   * Opens an ACTIVE subscription on `planId` for `term`, cancelling every other
   * live subscription the member has. Runs inside the CALLER's transaction:
   * this is the front-desk sale path, where the payment row is written in the
   * same unit of work and neither may exist without the other.
   *
   * Three deliberate differences from changePlan(byAdmin), all because a member
   * is standing at the counter with money in hand:
   *  - Renewing the SAME plan is allowed. changePlan refuses it, which is right
   *    for self-service, where a member could otherwise open the same request
   *    twice, and wrong here, where renewal is the most common sale.
   *  - A stale PENDING request is CANCELLED rather than treated as a conflict.
   *    Leaving it alive would let a later payment activate it and grant a
   *    period nobody paid for twice.
   *  - A renewal with unused paid days EXTENDS them: the new period starts the
   *    day after the current ACTIVE subscription's endDate, if that endDate has
   *    not passed. Confirmed with the human owner as a product decision —
   *    activate()'s "starts when the payment lands" rule is left exactly as it
   *    is, since it answers a different question (a stale unpaid request), not
   *    this one (an early renewal with money already down).
   *
   * Every read and write goes through `manager`. Using this.subscriptionRepository
   * anywhere in here would work in the happy path and silently not roll back.
   */
  async replaceActiveSubscription(
    manager: EntityManager,
    input: {
      userId: number;
      planId: number;
      term: ResolvedTerm;
      // What the member was actually charged, which is not term.price
      // whenever the front desk gives a discount. estimatedMrr divides this
      // by the term's months, so recording the list price here would report
      // revenue the gym never billed.
      soldPrice: number;
      // Set only by a prorated plan change: the new subscription inherits the
      // replaced term's endDate instead of opening a fresh period, which is
      // what makes an upgrade cost only the difference.
      endDate?: Date;
      changedFromSubscriptionId?: number;
    },
  ): Promise<Subscription> {
    const live = await manager.find(Subscription, {
      where: [
        {
          userId: input.userId,
          state: SubscriptionState.ACTIVE,
          deleted: false,
        },
        {
          userId: input.userId,
          state: SubscriptionState.PENDING,
          deleted: false,
        },
      ],
    });

    // Read before cancelling: once `previous.state` is overwritten below there
    // is nothing left to extend from.
    // `state` is a plain string column, so the enum member is widened to its
    // value before comparing (matches PaymentService.createManualPayment).
    const today = toDateOnly(new Date());
    const activeState: string = SubscriptionState.ACTIVE;
    const currentActive = live.find((s) => s.state === activeState);
    const from =
      currentActive && isCurrentOn(currentActive.endDate, today)
        ? dayAfter(String(currentActive.endDate))
        : new Date();

    for (const previous of live) {
      previous.state = SubscriptionState.CANCELLED;
      // A downgrade scheduled on the row being replaced must not survive onto
      // the plan the member just paid to move to.
      previous.scheduledPlanId = null;
      await manager.save(previous);
    }

    // subscriptionPeriod, not a local calculation: a subscription created here
    // and one created by changePlan must not get their dates computed
    // differently — only the `from` argument varies here. Unless the caller
    // supplies an endDate (a prorated plan change), in which case the new row
    // inherits the replaced term's end instead of opening a fresh one.
    const period = input.endDate
      ? { startDate: toDateOnly(new Date()) as unknown as Date, endDate: input.endDate }
      : subscriptionPeriod(input.term.numDays, from);

    const created = manager.create(Subscription, {
      userId: input.userId,
      planId: input.planId,
      // A prorated change buys no term, so it has no duration to point at.
      planDurationId: input.endDate ? null : input.term.planDurationId,
      soldPrice: input.soldPrice,
      changedFromSubscriptionId: input.changedFromSubscriptionId ?? null,
      ...period,
      state: SubscriptionState.ACTIVE,
      deleted: false,
    });

    return manager.save(created);
  }

  // Same move as changePlan, made by an admin on behalf of a member who is
  // standing at the counter. The id comes from the route instead of the JWT,
  // so unlike the self-service path it has to be checked.
  async assignPlanToMember(userId: number, planId: number) {
    const member = await this.userService.findUser(userId);
    if (!member || member.deleted) {
      throw new NotFoundException(`El socio con ID: ${userId} no existe.`);
    }
    return this.changePlan(userId, planId, true);
  }

  // Full subscription history of one specific user (admin Users panel), most
  // recent first.
  async findByUser(userId: number) {
    return this.subscriptionRepository.find({
      where: { userId, deleted: false },
      relations: { plan: true },
      order: { id: 'DESC' },
    });
  }

  // Promotes a PENDING subscription once its payment is recorded. Called by
  // PaymentService so that payment never has to reach into this repository.
  // This is also where the member's previous plan actually loses access: a
  // self-service changePlan leaves the old ACTIVE subscription untouched, so
  // it has to be cancelled here, once the replacement is paid for.
  //
  // The caller supplies the paid period length in `days` (e.g. termMonths *
  // plan.numDays for a multi-month term) — same convention as `renew` below —
  // since a subscription's day count can no longer be derived from the plan
  // alone once multi-month terms are in play.
  async activate(id: number, days: number) {
    const subscription = await this.findSubscription(id);
    if (!subscription) {
      throw new NotFoundException(`La suscripción con ID: ${id} no existe.`);
    }

    const previousActive = await this.subscriptionRepository.findOne({
      where: {
        userId: subscription.userId,
        state: SubscriptionState.ACTIVE,
        deleted: false,
      },
    });
    if (previousActive && previousActive.id !== subscription.id) {
      previousActive.state = SubscriptionState.CANCELLED;
      await this.subscriptionRepository.save(previousActive);
    }

    // A PENDING row keeps the dates it was born with. One that sat unpaid for
    // weeks — the member changed their mind, then came back — would otherwise
    // go ACTIVE with an endDate already in the past, and since nothing expires
    // a subscription yet (FLG-SEC-24) that reads as permanent access. The paid
    // period starts when the payment lands, not when it was requested.
    const plan = await this.planService.findPlanIncludingDeleted(
      subscription.planId,
    );
    if (!plan) {
      throw new NotFoundException(
        `El plan con ID: ${subscription.planId} no existe.`,
      );
    }
    const period = subscriptionPeriod(days);
    subscription.startDate = period.startDate;
    subscription.endDate = period.endDate;

    subscription.state = SubscriptionState.ACTIVE;
    return this.subscriptionRepository.save(subscription);
  }

  // Extends a paid membership. Unlike `activate`, which recomputes the dates from
  // today because a PENDING subscription may have sat unpaid for weeks, this one
  // counts from the existing endDate: the member is paying early, on purpose, and
  // must not lose the days they already hold. Also lifts a subscription the
  // nightly sweep already marked INACTIVE, which happens when a renewal lands late.
  //
  // Deliberately does NOT cancel the member's other subscriptions. That is
  // `activate`'s job, and doing it here would cancel the very membership being renewed.
  async renew(id: number, days: number) {
    const subscription = await this.findSubscription(id);
    if (!subscription) {
      throw new NotFoundException(`La suscripción con ID: ${id} no existe.`);
    }

    // A downgrade scheduled mid-term takes effect exactly here: the next term
    // is the first one the member has not already paid for on the old plan.
    if (subscription.scheduledPlanId != null) {
      const scheduled = await this.planService.findPlan(
        subscription.scheduledPlanId,
      );
      if (scheduled && !scheduled.deleted) {
        subscription.planId = scheduled.id;
        // The new term is a different plan: the old term's discount and sold
        // price describe nothing about it, and leaving them would report the
        // member at the old plan's MRR for the whole new term.
        subscription.planDurationId = null;
        subscription.soldPrice = Number(scheduled.price);
      }
      subscription.scheduledPlanId = null;
    }

    const period = renewalPeriod(subscription.endDate, days);
    subscription.endDate = period.endDate;
    subscription.state = SubscriptionState.ACTIVE;

    return this.subscriptionRepository.save(subscription);
  }

  // Toggles auto-renewal on one subscription. The "needs an active,
  // chargeable card to turn ON" business rule deliberately does NOT live
  // here — it lives in subscription.controller.ts's setAutoRenew route,
  // which is the only caller and is the one place that can reach both
  // this service and SavedCardService without a circular module import (see
  // savedCard.module.ts). This method itself stays a simple, unconditional
  // field write, same as every other single-column update in this file.
  async setAutoRenew(id: number, autoRenew: boolean) {
    const subscription = await this.findSubscription(id);
    if (!subscription) {
      throw new NotFoundException(`La suscripción con ID: ${id} no existe.`);
    }
    subscription.autoRenew = autoRenew;
    return this.subscriptionRepository.save(subscription);
  }

  // The authenticated user's active subscription, or null if there is none.
  //
  // The endDate check is the security boundary for FLG-SEC-24, and it is
  // deliberately evaluated here rather than left to the nightly sweep in
  // expireLapsedSubscriptions: a sweep that fails, crashes or is never
  // registered would silently restore free access to every lapsed member, and
  // nothing would surface that it had. This check cannot fail that way — it
  // runs on the request that depends on it. Do not remove it on the grounds
  // that the sweep already sets INACTIVE.
  //
  // All four callers are covered by putting it here: enroll,
  // createClassRegistration and findMyEnrollments in classRegistration, plus
  // the member's own read in subscription.controller.
  async findActiveForUser(userId: number) {
    const subscription = await this.subscriptionRepository.findOne({
      where: { userId, state: SubscriptionState.ACTIVE, deleted: false },
      relations: { plan: true },
    });

    if (!subscription) {
      return null;
    }

    return isCurrentOn(subscription.endDate, toDateOnly(new Date()))
      ? subscription
      : null;
  }

  // Everything assessChange needs about the member's live term, and the row
  // itself for the caller to act on. Looks at PAUSED and PENDING too, unlike
  // findActiveForUser: a paused member asking to change plans must be told
  // that their plan is paused ('not_current'), not that they have no plan.
  async findChangeContext(
    userId: number,
  ): Promise<{ subscription: Subscription; current: CurrentTerm } | null> {
    const live = await this.subscriptionRepository.findOne({
      where: [
        { userId, state: SubscriptionState.ACTIVE, deleted: false },
        { userId, state: SubscriptionState.PAUSED, deleted: false },
        { userId, state: SubscriptionState.PENDING, deleted: false },
      ],
      relations: { plan: true },
      order: { id: 'DESC' },
    });

    if (!live) return null;

    // Exactly one hop, never a walk — see Subscription.changedFromSubscriptionId.
    let termStartDate: Date | string = live.startDate;
    if (live.changedFromSubscriptionId != null) {
      const origin = await this.subscriptionRepository.findOne({
        where: { id: live.changedFromSubscriptionId },
      });
      if (origin) termStartDate = origin.startDate;
    }

    return {
      subscription: live,
      current: {
        plan: live.plan,
        state: live.state,
        termStartDate,
        endDate: live.endDate,
        alreadyChanged: live.changedFromSubscriptionId != null,
      },
    };
  }

  /**
   * The money-free half of a plan change: schedules a downgrade for the end of
   * the term, or applies a lateral move on the spot.
   *
   * Refuses an upgrade outright. An upgrade is priced and must go through
   * checkout — reaching this route with one would hand the member a dearer
   * plan for free, which is the one failure mode this whole feature must not
   * have.
   */
  async applyPlanChange(userId: number, planId: number) {
    const plan = await this.planService.findPlan(planId);
    if (!plan || plan.deleted) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    const context = await this.findChangeContext(userId);
    const assessment = assessChange({
      next: plan,
      current: context?.current ?? null,
      today: toDateOnly(new Date()),
    });

    if (!assessment.eligible) {
      // Same instanceof guard as CheckoutService.getPlanChangeQuote: this is
      // typed Date | string, and MySQL always hands back a string today, but
      // toDateOnly itself only accepts a Date.
      const termStartDate = context
        ? context.current.termStartDate instanceof Date
          ? toDateOnly(context.current.termStartDate)
          : String(context.current.termStartDate).slice(0, 10)
        : null;

      throw new ConflictException(
        blockMessage(assessment.reason, {
          unlocksOn: termStartDate
            ? addDays(termStartDate, PLAN_CHANGE_LOCK_DAYS)
            : undefined,
        }),
      );
    }

    if (assessment.direction === 'upgrade') {
      throw new ConflictException(
        'Mejorar de plan tiene un costo. Completá el pago para aplicarlo.',
      );
    }

    const live = context!.subscription;

    if (assessment.direction === 'lateral') {
      live.planId = planId;
      live.scheduledPlanId = null;
      // planDurationId still points at the OLD plan's PlanDuration row —
      // stale the moment planId changes out from under it, since a
      // PlanDuration belongs to exactly one plan. soldPrice is left alone on
      // purpose: the member already paid what they paid at whatever
      // discount applied, and a lateral move is explicitly free, so their
      // prior payment record should stand. Only the duration FK, which no
      // longer correctly describes this row, needs to be nulled (final
      // review, Important finding).
      live.planDurationId = null;
    } else {
      live.scheduledPlanId = planId;
    }

    await this.subscriptionRepository.save(live);
    return {
      direction: assessment.direction,
      effectiveFrom:
        assessment.direction === 'lateral'
          ? toDateOnly(new Date())
          : addDays(
              live.endDate instanceof Date
                ? toDateOnly(live.endDate)
                : String(live.endDate).slice(0, 10),
              1,
            ),
      subscription: await this.findSubscription(live.id),
    };
  }

  // Clears a scheduled downgrade set by applyPlanChange. The live term itself
  // is untouched — this only cancels what would have happened at renewal.
  async cancelScheduledPlanChange(userId: number) {
    const context = await this.findChangeContext(userId);
    if (!context || context.subscription.scheduledPlanId == null) {
      throw new NotFoundException('No tenés un cambio de plan programado.');
    }

    context.subscription.scheduledPlanId = null;
    await this.subscriptionRepository.save(context.subscription);
    return this.findSubscription(context.subscription.id);
  }

  // Moves subscriptions that have run out to INACTIVE, nightly.
  //
  // This is BOOKKEEPING, not the access boundary — findActiveForUser already
  // refuses a lapsed subscription on every request regardless of what `state`
  // says, and it has to, because a sweep that never runs must not reopen
  // access. What this adds is a `state` column that tells the truth, so admin
  // screens that list by state instead of re-deriving currency stop showing
  // lapsed members as active. Before this, nothing in the codebase ever
  // assigned INACTIVE at all.
  //
  // LessThan, not LessThanOrEqual: a subscription ending today is still
  // current, matching isCurrentOn's inclusive boundary.
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async expireLapsedSubscriptions(): Promise<UpdateResult> {
    return this.subscriptionRepository.update(
      {
        state: SubscriptionState.ACTIVE,
        deleted: false,
        endDate: LessThan(toDateOnly(new Date()) as unknown as Date),
      },
      { state: SubscriptionState.INACTIVE },
    );
  }

  // The subscriptions an auto-renewal charge should be attempted for today —
  // `dueDates` is the output of renewalDueDates, so this only ever returns
  // rows ending within the RENEWAL_LEAD_DAYS lookahead window. Filters on
  // ACTIVE, so a PAUSED membership (autoRenew or not) is never selected for
  // charging. Loads `plan` and `user` because the renewal cron needs the
  // plan's price and the member's contact details without a second query.
  async findDueForRenewal(dueDates: string[]) {
    return this.subscriptionRepository.find({
      where: {
        autoRenew: true,
        state: SubscriptionState.ACTIVE,
        deleted: false,
        endDate: In(dueDates),
      },
      relations: { plan: true, user: true },
    });
  }

  async createSubscription(subscriptionDto: SubscriptionDto) {
    const newSubscription = this.subscriptionRepository.create({
      ...subscriptionDto,
      startDate: new Date(subscriptionDto.startDate),
      endDate: new Date(subscriptionDto.endDate),
      state: subscriptionDto.state ?? SubscriptionState.ACTIVE,
      deleted: subscriptionDto.deleted ?? false,
    });
    return await this.subscriptionRepository.save(newSubscription);
  }

  // Thin passthrough so pause.service.ts — which lives in PauseModule, not
  // this one, to avoid a circular import with classRegistrationModule (see
  // pause.module.ts) — can persist the state it composes from
  // findSubscription's result (state/pausedAt/pausedById/endDate) without
  // this module reaching into ClassRegistrationService itself. No business
  // logic here on purpose: the ACTIVE/PAUSED checks and the date arithmetic
  // both live in pause.service.ts, next to the pure functions they compose.
  async save(subscription: Subscription) {
    return this.subscriptionRepository.save(subscription);
  }

  async findSubscription(id: number) {
    return await this.subscriptionRepository.findOne({
      where: { id },
      relations: { user: true, plan: true },
    });
  }

  async findAll() {
    return await this.subscriptionRepository.find({
      where: { deleted: false },
      relations: { user: true, plan: true },
    });
  }

  async findAllDeleted() {
    return await this.subscriptionRepository.find({
      where: { deleted: true },
      relations: { user: true, plan: true },
    });
  }

  async updateSubscription(subscriptionDto: SubscriptionDto) {
    if (!subscriptionDto.id) {
      throw new ConflictException(
        'El ID de la suscripción es obligatorio para actualizar.',
      );
    }
    const exists = await this.findSubscription(subscriptionDto.id);
    if (!exists) {
      throw new NotFoundException(
        `La suscripción con ID: ${subscriptionDto.id} no existe.`,
      );
    }
    const updatedsubscription = {
      ...subscriptionDto,
      startDate: subscriptionDto.startDate
        ? new Date(subscriptionDto.startDate)
        : exists.startDate,
      endDate: subscriptionDto.endDate
        ? new Date(subscriptionDto.endDate)
        : exists.endDate,
    };
    return await this.subscriptionRepository.save(updatedsubscription);
  }

  async deleteSubscription(id: number) {
    const exists = await this.findSubscription(id);
    if (!exists) {
      throw new NotFoundException(`La suscripción con ID: ${id} no existe.`);
    }
    if (exists.deleted) {
      throw new ConflictException(`La suscripción ya está eliminada.`);
    }
    const rows: UpdateResult = await this.subscriptionRepository.update(
      { id },
      { deleted: true },
    );
    if (rows.affected === 0) {
      throw new ConflictException(`No se pudo eliminar la suscripcion`);
    }

    return { message: `Eliminada correctamente` };
  }
  async restoreSubscription(id: number) {
    const exists = await this.findSubscription(id);
    if (!exists) {
      throw new NotFoundException(`La suscripción con ID: ${id} no existe.`);
    }
    if (!exists.deleted) {
      throw new ConflictException(`La suscripción no está borrada.`);
    }
    const rows: UpdateResult = await this.subscriptionRepository.update(
      { id },
      { deleted: false },
    );
    if (rows.affected === 0) {
      throw new ConflictException(`No se pudo restaurar la suscripcion`);
    }

    return { message: `Restaurada correctamente` };
  }
}
