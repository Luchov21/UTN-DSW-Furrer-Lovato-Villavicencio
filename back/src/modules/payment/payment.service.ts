import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository, UpdateResult } from 'typeorm';
import { Payment } from './entity/payment.entity';
import { PaymentDto } from './dto/payment-dto';
import { ManualPaymentDto } from './dto/manual-payment-dto';
import { MercadoPagoPaymentDto } from './dto/mercadopago-payment-dto';
import { PlanCheckoutDto } from './dto/plan-checkout-dto';
import { PaymentQueryDto } from './dto/payment-query-dto';
import { PaymentState } from './enum/payment-state.enum';
import { subscriptionService } from '../subscription/subscription.service';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';
import { Subscription } from '../subscription/entity/subscription.entity';
import { UserService } from '../user/user.service';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { resolveTerm } from '../plan/plan-duration.rules';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly subscriptionService: subscriptionService,
    private readonly planService: PlanService,
    private readonly planDurationService: PlanDurationService,
    private readonly userService: UserService,
  ) {}

  // One in-person sale, written atomically. The old path — assignPlanToMember,
  // then POST /Payment/manual — was two independent requests with no unit of
  // work between them: a failure after the first left the member with an
  // active plan and no payment on record.
  async registerPlanPayment(dto: PlanCheckoutDto, adminId: number) {
    // Validation happens outside the transaction: it takes no locks, and a
    // rejected sale should not have opened one.
    const member = await this.userService.findUser(dto.userId);
    if (!member || member.deleted) {
      throw new NotFoundException(`El socio con ID: ${dto.userId} no existe.`);
    }

    const plan = await this.planService.findPlan(dto.planId);
    if (!plan) {
      throw new NotFoundException(`El plan con ID: ${dto.planId} no existe.`);
    }

    const durations = await this.planDurationService.findByPlan(dto.planId);
    const term = resolveTerm(plan, dto.months, durations);

    return this.dataSource.transaction(async (manager) => {
      const subscription =
        await this.subscriptionService.replaceActiveSubscription(manager, {
          userId: dto.userId,
          planId: dto.planId,
          term,
          soldPrice: dto.amount,
        });

      const payment = manager.create(Payment, {
        subscriptionId: subscription.id,
        amount: dto.amount,
        payMethod: dto.payMethod,
        date: new Date(),
        state: PaymentState.COMPLETED,
        registeredById: adminId,
        // Without this the column default of 1 records every multi-month sale
        // as a single month. Nothing reads it today, but the data is wrong
        // the moment anything does.
        termMonths: term.months,
        // The plan's own monthly list price — same meaning the field already
        // carries in createFromMercadoPago. Not the discounted amount: that
        // is what `amount` and the subscription's soldPrice record.
        monthlyPriceAtPurchase: plan.price,
        deleted: false,
      });

      return manager.save(payment);
    });
  }

  // The webhook's counterpart to registerPlanPayment: same unit of work, but
  // triggered by Mercado Pago confirming an approved payment rather than by
  // the admin's own request. The subscription is created HERE and nowhere
  // earlier, so an abandoned or declined charge leaves the member's
  // membership untouched.
  async confirmPlanCharge(input: {
    mpPaymentId: string;
    userId: number;
    planId: number;
    months: number;
    amount: number;
    payMethod: string;
    registeredById?: number | null;
    mpOrderId?: string | null;
    // Set only by a prorated plan-change checkout (front-desk or online):
    // the id of the subscription being replaced, and the end date the new
    // one must inherit instead of opening a fresh term. See
    // subscriptionService.replaceActiveSubscription's own comment on the
    // same two fields.
    changeFromSubscriptionId?: number | null;
    endDateOverride?: Date | null;
  }): Promise<{ payment: Payment; subscription: Subscription }> {
    // Idempotency first: Mercado Pago retries a notification up to eight
    // times over four days, and a retry must not sell the plan twice.
    const existing = await this.findByMpPaymentId(input.mpPaymentId);
    if (existing) {
      return { payment: existing, subscription: existing.subscription };
    }

    const plan = await this.planService.findPlan(input.planId);
    if (!plan) {
      throw new NotFoundException(`El plan con ID: ${input.planId} no existe.`);
    }

    const durations = await this.planDurationService.findByPlan(input.planId);
    const isPlanChange = input.changeFromSubscriptionId != null;

    // A prorated change buys no term, so resolveTerm has nothing to resolve
    // — no PlanDuration has 0 months, and none should.
    const term = isPlanChange
      ? {
          months: 0,
          numDays: plan.numDays,
          price: Number(plan.price),
          planDurationId: null,
        }
      : resolveTerm(plan, input.months, durations);

    const { payment, subscription } = await this.dataSource.transaction(
      async (manager) => {
        const subscription =
          await this.subscriptionService.replaceActiveSubscription(manager, {
            userId: input.userId,
            planId: input.planId,
            term,
            // Per the spec's R6: on a prorated row soldPrice is the new
            // plan's regular monthly price — the member's ongoing value —
            // not the difference collected, which lives on the Payment row
            // (`amount` below). Recording the discounted amount here would
            // report this member's MRR contribution at the one-time
            // proration instead of what they actually pay from here on.
            soldPrice: isPlanChange ? Number(plan.price) : input.amount,
            ...(isPlanChange
              ? {
                  endDate: input.endDateOverride!,
                  changedFromSubscriptionId: input.changeFromSubscriptionId!,
                }
              : {}),
          });

        const payment = manager.create(Payment, {
          subscriptionId: subscription.id,
          mpPaymentId: input.mpPaymentId,
          amount: input.amount,
          payMethod: input.payMethod,
          date: new Date(),
          state: PaymentState.COMPLETED,
          registeredById: input.registeredById ?? null,
          mpOrderId: input.mpOrderId ?? null,
          // 0 on a plan change: a prorated adjustment is not a purchase of N
          // months, and 1 would overstate it the moment anything reads this.
          termMonths: term.months,
          // Same convention as createFromMercadoPago: the plan's monthly list
          // price, not the discounted amount.
          monthlyPriceAtPurchase: plan.price,
          deleted: false,
        });

        return { payment: await manager.save(payment), subscription };
      },
    );

    // replaceActiveSubscription returns manager.save(created) — a plain
    // save(), which TypeORM never runs eager relations for (those only load
    // on find/findOne). Subscription.user/plan are eager:true, so without
    // this re-fetch the caller (WebhookService, for the receipt email) gets
    // a subscription with user/plan undefined. Outside the transaction: the
    // write already committed, so this read needs no lock.
    const hydratedSubscription =
      await this.subscriptionService.findSubscription(subscription.id);
    if (!hydratedSubscription) {
      throw new NotFoundException(
        `La suscripción con ID: ${subscription.id} no existe.`,
      );
    }

    return { payment, subscription: hydratedSubscription };
  }

  // In-person payment recorded by an admin (see specs.md §3.5). Still the
  // only way a payment gets written until Mercado Pago exists.
  async createManualPayment(dto: ManualPaymentDto, adminId: number) {
    const subscription = await this.subscriptionService.findSubscription(
      dto.subscriptionId,
    );
    if (!subscription || subscription.deleted) {
      throw new NotFoundException(
        `La suscripción con ID: ${dto.subscriptionId} no existe.`,
      );
    }

    const termMonths = dto.termMonths ?? 1;

    // Done before the payment row is written so a failure here leaves no
    // payment standing against a subscription that wasn't actually promoted
    // or extended.
    await this.promoteOrExtendSubscription(subscription, termMonths);

    const newPayment = this.paymentRepository.create({
      subscriptionId: dto.subscriptionId,
      amount: dto.amount,
      payMethod: dto.payMethod,
      date: new Date(),
      state: PaymentState.COMPLETED,
      registeredById: adminId,
      termMonths,
      monthlyPriceAtPurchase: subscription.plan.price,
      deleted: false,
    });
    return this.paymentRepository.save(newPayment);
  }

  // A payment coming from Mercado Pago (Checkout Pro webhook, Point, QR, or
  // the renewal cron). Shares the exact same promotion/extension branch as
  // createManualPayment — the money-in-advance rule doesn't change based on
  // who is paying — but is idempotent on mpPaymentId, since Mercado Pago
  // retries a notification up to eight times over four days and a retry must
  // not write a second row or extend a membership twice.
  async createFromMercadoPago(dto: MercadoPagoPaymentDto) {
    const existing = await this.findByMpPaymentId(dto.mpPaymentId);
    if (existing) {
      return existing;
    }

    const subscription = await this.subscriptionService.findSubscription(
      dto.subscriptionId,
    );
    if (!subscription || subscription.deleted) {
      throw new NotFoundException(
        `La suscripción con ID: ${dto.subscriptionId} no existe.`,
      );
    }

    await this.promoteOrExtendSubscription(subscription, dto.termMonths);

    const newPayment = this.paymentRepository.create({
      subscriptionId: dto.subscriptionId,
      mpPaymentId: dto.mpPaymentId,
      amount: dto.amount,
      payMethod: dto.payMethod,
      date: new Date(),
      state: PaymentState.COMPLETED,
      registeredById: dto.registeredById ?? null,
      mpOrderId: dto.mpOrderId ?? null,
      termMonths: dto.termMonths,
      monthlyPriceAtPurchase: subscription.plan.price,
      deleted: false,
    });

    try {
      return await this.paymentRepository.save(newPayment);
    } catch (error) {
      // The DB's UNIQUE constraint on mpPaymentId is the real idempotency
      // guarantee against two payment ROWS for the same MP notification: the
      // findByMpPaymentId check above is a fast path, not a lock, so two
      // genuinely simultaneous deliveries can both pass it before either
      // saves, and the second save() here hits a duplicate-key error.
      // Recover by returning the row the other delivery just wrote, rather
      // than letting an ugly 500 propagate for what is, from the caller's
      // perspective (Mercado Pago retrying a notification), a successful
      // outcome.
      //
      // This does NOT close the whole race: the subscription mutation
      // (activate/renew above) already ran for both deliveries by the time
      // either reaches this point, since it isn't wrapped in the same
      // transaction as the payment write. subscriptionService.activate()/
      // renew() use their own injected repository rather than a
      // transaction-scoped EntityManager, so making this properly atomic
      // would mean threading an optional EntityManager through
      // subscription.service.ts — a cross-cutting change to an
      // already-reviewed file, out of proportion to what this fixes. The
      // accepted residual risk: in a genuine simultaneous-delivery race, a
      // subscription could be activated/extended twice (a few extra free
      // days) — never charged twice, since there is only ever one real
      // Mercado Pago payment behind a given mpPaymentId.
      if (this.isDuplicateKeyError(error)) {
        const existingPayment = await this.findByMpPaymentId(dto.mpPaymentId);
        if (existingPayment) {
          return existingPayment;
        }
      }
      throw error;
    }
  }

  // A standalone FAILED row for a declined charge — the renewal cron's
  // decline path. Deliberately does NOT go through promoteOrExtendSubscription
  // (unlike createManualPayment/createFromMercadoPago): a decline is a
  // successful API call that simply wasn't approved, and the subscription's
  // endDate must be left exactly as it was, not activated or extended. No
  // mpPaymentId either — Mercado Pago's own payment id exists for a decline
  // too, but nothing here needs to look a failed attempt back up by it the
  // way createFromMercadoPago's idempotency check does for an approved one.
  async createFailedPayment(dto: {
    subscriptionId: number;
    amount: number;
    payMethod: string;
    termMonths: number;
    monthlyPriceAtPurchase: number;
  }) {
    const newPayment = this.paymentRepository.create({
      subscriptionId: dto.subscriptionId,
      amount: dto.amount,
      payMethod: dto.payMethod,
      date: new Date(),
      state: PaymentState.FAILED,
      registeredById: null,
      termMonths: dto.termMonths,
      monthlyPriceAtPurchase: dto.monthlyPriceAtPurchase,
      deleted: false,
    });
    return this.paymentRepository.save(newPayment);
  }

  private isDuplicateKeyError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false;
    }
    const err = error as { code?: unknown; driverError?: { code?: unknown } };
    return (
      err.code === 'ER_DUP_ENTRY' || err.driverError?.code === 'ER_DUP_ENTRY'
    );
  }

  // The self-service gate (PENDING → ACTIVE) plus the advance-payment fix
  // (ACTIVE → extend by the term just paid) plus the PAUSED guard (a frozen
  // membership must be resumed, not extended here, or the member gets the
  // same days credited twice — once here, once at unpause).
  //
  // INACTIVE is treated the same as PENDING: the nightly sweep
  // (expireLapsedSubscriptions in subscription.service.ts) sets state to
  // INACTIVE on a lapsed subscription without deleting it, so a lapsed
  // member paying to come back is the single most common real case this
  // branch has to handle. activate() is state-agnostic — it recomputes
  // startDate/endDate fresh from today, cancels any other ACTIVE
  // subscription for the same user, and sets state to ACTIVE — which is
  // exactly right whether the subscription was PENDING or had lapsed to
  // INACTIVE.
  //
  // CANCELLED is refused, same pattern as PAUSED: a cancelled subscription
  // is a dead historical record (superseded by a plan change, or explicitly
  // cancelled/refunded). An admin recording a payment must be paying against
  // the member's actual current subscription, not an old cancelled row.
  //
  // `state` is a plain string column, so each enum member is widened to its
  // value before comparing.
  private async promoteOrExtendSubscription(
    subscription: Subscription,
    termMonths: number,
  ) {
    const pendingState: string = SubscriptionState.PENDING;
    const activeState: string = SubscriptionState.ACTIVE;
    const inactiveState: string = SubscriptionState.INACTIVE;
    const pausedState: string = SubscriptionState.PAUSED;
    const cancelledState: string = SubscriptionState.CANCELLED;

    if (
      subscription.state === pendingState ||
      subscription.state === inactiveState
    ) {
      await this.subscriptionService.activate(
        subscription.id,
        termMonths * subscription.plan.numDays,
      );
    } else if (subscription.state === activeState) {
      // assignPlanToMember (byAdmin=true) opens a subscription ACTIVE with the
      // correct period already set, but with zero payments recorded — the first
      // payment against it must activate (recompute from today), exactly like
      // the self-service PENDING path, not extend on top of a period nobody
      // paid for yet. Only a subscription that already has a completed payment
      // is a genuine advance payment, which extends.
      //
      // Checked BEFORE the new payment row is written (same as the rest of
      // this method), so it answers "has this subscription EVER been paid for"
      // at decision time. Safe against activate()'s "cancel the user's other
      // ACTIVE subscription" side effect: changePlan already cancelled any
      // prior ACTIVE row at assignment time, so there is none left to find.
      const currentPayment = await this.findCurrentTermPayment(subscription.id);
      if (currentPayment) {
        // renew() may switch this subscription to a scheduled plan; the
        // period length has to come from the plan the term will actually be
        // on.
        const nextPlan =
          subscription.scheduledPlanId != null
            ? ((await this.planService.findPlan(
                subscription.scheduledPlanId,
              )) ?? subscription.plan)
            : subscription.plan;

        await this.subscriptionService.renew(
          subscription.id,
          termMonths * nextPlan.numDays,
        );
      } else {
        await this.subscriptionService.activate(
          subscription.id,
          termMonths * subscription.plan.numDays,
        );
      }
    } else if (subscription.state === pausedState) {
      throw new ConflictException(
        'Reanudá la membresía antes de registrar un pago.',
      );
    } else if (subscription.state === cancelledState) {
      throw new ConflictException('Esta suscripción está cancelada.');
    }
  }

  // Looked up first by createFromMercadoPago as the idempotency guarantee: a
  // second delivery of the same MP notification must return the row already
  // written, not create another one. Filtered to deleted: false so a
  // soft-deleted payment (e.g. an admin correction) can never be mistaken by
  // a later webhook retry for "already processed".
  async findByMpPaymentId(mpPaymentId: string) {
    return await this.paymentRepository.findOne({
      where: { mpPaymentId, deleted: false },
    });
  }

  // The payment that is currently "in force" for a subscription: the most
  // recent completed, not-yet-refunded, not-deleted one. A refund (task 19)
  // acts on exactly this row.
  async findCurrentTermPayment(subscriptionId: number) {
    return await this.paymentRepository.findOne({
      where: {
        subscriptionId,
        state: PaymentState.COMPLETED,
        refundedAt: IsNull(),
        deleted: false,
      },
      order: { date: 'DESC' },
    });
  }

  // Payment history of the authenticated user, through their own
  // subscriptions. userId comes from the JWT — never accept one as a
  // parameter here or anyone could read another person's payment history.
  async findMineForUser(userId: number) {
    return this.findByUser(userId);
  }

  // Payment history of one specific user (admin Users panel).
  async findByUser(userId: number) {
    return this.paymentRepository
      .createQueryBuilder('payment')
      .leftJoinAndSelect('payment.subscription', 'subscription')
      .leftJoinAndSelect('subscription.plan', 'plan')
      .where('subscription.userId = :userId', { userId })
      .andWhere('payment.deleted = false')
      .orderBy('payment.date', 'DESC')
      .getMany();
  }

  async createPayment(paymentDto: PaymentDto) {
    // termMonths/monthlyPriceAtPurchase are NOT NULL on the entity but this
    // DTO predates them (it also backs the generic admin CRUD update, where
    // they're rarely relevant), so a value here is not guaranteed. Fall back
    // to "one month, at the amount actually charged" rather than letting the
    // write fail — this path is not the primary place those columns are
    // meant to be accurate; createManualPayment and createFromMercadoPago are.
    const termMonths = paymentDto.termMonths ?? 1;
    const monthlyPriceAtPurchase =
      paymentDto.monthlyPriceAtPurchase ?? paymentDto.amount / termMonths;

    const newPayment = this.paymentRepository.create({
      ...paymentDto,
      date: new Date(paymentDto.date),
      state: paymentDto.state ?? PaymentState.COMPLETED,
      termMonths,
      monthlyPriceAtPurchase,
      deleted: paymentDto.deleted ?? false,
    });
    return await this.paymentRepository.save(newPayment);
  }

  // Thin passthrough so RefundService (RefundModule) can persist the refund
  // fields (refundedAmount/refundedAt/refundedById/state) it sets directly
  // on the entity, without RefundModule reaching into this repository
  // itself. No business logic here on purpose — same pattern as
  // subscriptionService.save() in subscription.service.ts, which
  // pause.service.ts uses the same way.
  async save(payment: Payment) {
    return this.paymentRepository.save(payment);
  }

  async findPayment(id: number) {
    return await this.paymentRepository.findOne({
      where: { id },
      relations: { subscription: true },
    });
  }

  // A raw registeredById means nothing to the admin looking at the "Pagos
  // recientes" table, so each row is annotated with the recording admin's
  // name. registeredById has no relation on the entity — it is a bare
  // nullable column, not a foreign key TypeORM can join — so the lookup is
  // done by hand rather than through `relations`. One findUser() call per
  // distinct admin, not per payment: a front desk records many payments a
  // day under a handful of admins.
  //
  // Before this, every non-deleted payment came back with its member and
  // plan joined and the client threw away everything past the 25th.
  // Subscription's user and plan relations are eager, so each row carried a
  // full user and a full plan including its features JSON — about a
  // kilobyte a row, growing by one row per member per month, forever.
  async findAll(query: PaymentQueryDto) {
    const [payments, total] = await this.paymentRepository.findAndCount({
      where: { deleted: false },
      // Explicit relations down to 'user'/'plan': eager:true on the
      // Subscription entity cannot be assumed to cascade here.
      relations: { subscription: { user: true, plan: true } },
      order: { date: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    const adminIds = [
      ...new Set(
        payments
          .map((p) => p.registeredById)
          .filter((id): id is number => id != null),
      ),
    ];

    const adminNames = new Map<number, string>();
    for (const id of adminIds) {
      const admin = await this.userService.findUser(id);
      if (admin) {
        adminNames.set(id, `${admin.name} ${admin.surname ?? ''}`.trim());
      }
    }

    return {
      items: payments.map((p) => ({
        ...p,
        registeredByName:
          p.registeredById != null
            ? (adminNames.get(p.registeredById) ?? null)
            : null,
      })),
      total,
    };
  }

  async findAllDeleted() {
    return await this.paymentRepository.find({
      where: { deleted: true },
      relations: { subscription: true },
    });
  }

  async updatePayment(paymentDto: PaymentDto) {
    if (!paymentDto.id) {
      throw new ConflictException(
        'El ID del pago es obligatorio para actualizar.',
      );
    }
    const exists = await this.findPayment(paymentDto.id);
    if (!exists) {
      throw new NotFoundException(
        `El pago con ID: ${paymentDto.id} no existe.`,
      );
    }
    const updatedPayment = {
      ...paymentDto,
      date: paymentDto.date ? new Date(paymentDto.date) : exists.date,
    };
    return await this.paymentRepository.save(updatedPayment);
  }

  async deletePayment(id: number) {
    const exists = await this.findPayment(id);
    if (!exists) {
      throw new NotFoundException(`El pago con ID: ${id} no existe.`);
    }
    if (exists.deleted) {
      throw new ConflictException(`El pago ya está eliminado.`);
    }
    const rows: UpdateResult = await this.paymentRepository.update(
      { id },
      { deleted: true },
    );
    if (rows.affected === 0) {
      throw new ConflictException(`No se pudo eliminar el pago`);
    }

    return { message: `Eliminado correctamente` };
  }

  async restorePayment(id: number) {
    const exists = await this.findPayment(id);
    if (!exists) {
      throw new NotFoundException(`El pago con ID: ${id} no existe.`);
    }
    if (!exists.deleted) {
      throw new ConflictException(`El pago no está borrado.`);
    }
    const rows: UpdateResult = await this.paymentRepository.update(
      { id },
      { deleted: false },
    );
    if (rows.affected === 0) {
      throw new ConflictException(`No se restaurar el pago`);
    }

    return { message: `Restaurado correctamente` };
  }
}
