import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { ChargeOrder } from './entity/chargeOrder.entity';
import { ChargeOrderMethod } from './enum/chargeOrder-method.enum';
import { ChargeOrderStatus } from './enum/chargeOrder-status.enum';
import { subscriptionService } from '../subscription/subscription.service';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';
import { PlanDurationService } from '../plan/plan-duration.service';
import { resolveTerm } from '../plan/plan-duration.rules';
import { PlanService } from '../plan/plan.service';
import { UserService } from '../user/user.service';
import {
  buildExternalReference,
  ORDER_EXPIRATION_MS,
} from './chargeOrder.rules';

export interface CreateChargeParams {
  userId: number;
  planId: number;
  months: number;
  amount: number;
  method: 'point' | 'qr' | 'online';
  // Null only for 'online'. A point or QR order without one would arm a
  // charge nothing can collect.
  collectionPointId: string | null;
  // Null only for 'online' — self-service, no admin involved.
  adminId: number | null;
}

// Front-desk bookkeeping for card-terminal ("point") and QR charges. This is
// entity + local service only — no Mercado Pago calls happen here yet (that
// arrives with the controller in Task 16). See chargeOrder.rules.ts for the
// external_reference format and expiration shared with the MP order this
// row will eventually back.
@Injectable()
export class ChargeOrderService {
  private readonly logger = new Logger(ChargeOrderService.name);

  constructor(
    @InjectRepository(ChargeOrder)
    private chargeOrderRepository: Repository<ChargeOrder>,
    private readonly subscriptionService: subscriptionService,
    private readonly planDurationService: PlanDurationService,
    private readonly planService: PlanService,
    private readonly userService: UserService,
  ) {}

  // Arms a new charge order at the counter. The busy-collection-point check
  // (step 5) is the rule that makes a shared printed QR safe: whatever order
  // is armed on that caja is what the next person to scan will pay, so two
  // open orders on the same point would let two different members cross
  // amounts. It is deliberately keyed on collectionPointId, not
  // subscriptionId.
  async createCharge(params: CreateChargeParams) {
    const {
      userId,
      planId,
      months,
      amount,
      method,
      collectionPointId,
      adminId,
    } = params;

    // Defense in depth for the pairing the rest of this method assumes:
    // 'online' is the ONLY method without a collection point, and it is the
    // only one that skips the busy-point lock below. A 'point'/'qr' order
    // reaching that branch would arm a second live charge on a shared
    // physical caja with nothing guarding it; an 'online' order carrying a
    // caja id would key the lock (and the panel) on a caja no one is standing
    // at. CreateChargeOrderDto already refuses 'online' at the front-desk
    // endpoint — this catches any caller that gets past it.
    if (method === 'online' && collectionPointId !== null) {
      throw new ConflictException(
        'Un cobro online no puede tener un punto de cobro asignado.',
      );
    }
    if (method !== 'online' && collectionPointId === null) {
      throw new ConflictException(
        'Un cobro presencial necesita un punto de cobro.',
      );
    }

    const member = await this.userService.findUser(userId);
    if (!member || member.deleted) {
      throw new NotFoundException(`El socio con ID: ${userId} no existe.`);
    }

    // A deliberately frozen membership must not be sold to at the counter.
    // findByUser orders { id: 'DESC' }, so live[0] — not "any paused row" —
    // is the member's current subscription: a renewal sold in cash after a
    // pause opens a fresh row and leaves the old PAUSED one sitting there,
    // non-deleted, forever, and that stale row must not block this member's
    // real, current, unpaused membership.
    // `state` is a plain string column, so the enum member is widened to its
    // value before comparing — same pattern as PaymentService.
    const pausedState: string = SubscriptionState.PAUSED;
    const live = await this.subscriptionService.findByUser(userId);
    const [current] = live;
    if (current && !current.deleted && current.state === pausedState) {
      throw new ConflictException('No se puede cobrar una membresía pausada.');
    }

    const plan = await this.planService.findPlan(planId);
    if (!plan) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    // resolveTerm throws NotFoundException itself when `months` has no
    // matching (non-deleted) PlanDuration for this plan. Its price is NOT
    // used as the order amount — the admin's amount is, so a front-desk
    // discount is what the member is actually charged.
    const durations = await this.planDurationService.findByPlan(planId);
    const term = resolveTerm(plan, months, durations);

    // Expire stale orders before checking whether the point is busy, so an
    // abandoned charge from a few minutes ago never blocks the counter. Bulk
    // cleanup, not part of the atomicity concern below, so it runs on its
    // own outside the transaction.
    //
    // Only the counter can be blocked by a stale order; skip the sweep for an
    // online charge so a member's checkout does not pay for it.
    if (method !== 'online') {
      await this.expireStale();
    }

    const now = new Date();
    const externalReference = buildExternalReference(
      userId,
      randomUUID().slice(0, 8),
    );

    // The busy check and the insert MUST run as one atomic unit: two
    // near-simultaneous createCharge calls for the same collectionPointId (a
    // double-tap at the counter, two admin sessions) could otherwise both
    // pass the check before either saves, arming two live orders on one
    // physical point — exactly the failure this table exists to prevent.
    // setLock('pessimistic_write') takes a row lock on any matching order,
    // so a concurrent second transaction blocks on this SELECT until the
    // first one commits or rolls back, rather than racing past the check.
    // Same manager.transaction(...) pattern as
    // SavedCardService.saveForUser's deactivate-then-insert pair.
    return this.chargeOrderRepository.manager.transaction(async (manager) => {
      // The busy-point lock protects a shared physical collection point from
      // two live orders. An online order has none, so there is nothing to
      // lock — and taking the lock with a null key would serialise every
      // online checkout behind a single row.
      if (method !== 'online') {
        const pendingState: string = ChargeOrderStatus.PENDING;
        const busyOrder = await manager
          .createQueryBuilder(ChargeOrder, 'chargeOrder')
          .setLock('pessimistic_write')
          .where('chargeOrder.collectionPointId = :collectionPointId', {
            collectionPointId,
          })
          .andWhere('chargeOrder.status = :status', { status: pendingState })
          .getOne();
        if (busyOrder) {
          throw new ConflictException(
            'Ya hay un cobro en curso en este punto de cobro.',
          );
        }
      }

      const newOrder = manager.create(ChargeOrder, {
        subscriptionId: null,
        userId,
        planId,
        termMonths: term.months,
        planDurationId: term.planDurationId,
        method,
        externalReference,
        mpOrderId: null,
        qrPayload: null,
        collectionPointId,
        amount,
        status: ChargeOrderStatus.PENDING,
        expiresAt: new Date(now.getTime() + ORDER_EXPIRATION_MS),
        paymentId: null,
        createdById: adminId,
        createdAt: now,
        updatedAt: now,
      });

      return manager.save(newOrder);
    });
  }

  async findByExternalReference(externalReference: string) {
    return this.chargeOrderRepository.findOne({
      where: { externalReference },
    });
  }

  // Used by the controller (Task 16) for the polling GET and for the cancel
  // endpoint, both of which are keyed on the row's own id rather than its
  // external_reference.
  async findById(id: number) {
    const order = await this.chargeOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`La orden de cobro con ID: ${id} no existe.`);
    }
    return order;
  }

  // Fills in the Mercado Pago order id (and, for a 'qr' order, the QR
  // payload to render) once the controller successfully creates the order
  // on MP's side. Both are left null until then — see the entity's own
  // comments on mpOrderId/qrPayload. qrPayload is written in the SAME call
  // as mpOrderId (not a separate round trip) so a 'qr' order's payload is
  // persisted before the controller's POST response is even sent — a panel
  // reload or re-poll of GET /:id must be able to recover it, not just see
  // it once in that original response.
  async setMpOrderId(
    id: number,
    mpOrderId: string,
    qrPayload: string | null = null,
  ) {
    const order = await this.chargeOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`La orden de cobro con ID: ${id} no existe.`);
    }
    order.mpOrderId = mpOrderId;
    order.qrPayload = qrPayload;
    order.updatedAt = new Date();
    return this.chargeOrderRepository.save(order);
  }

  // Closes an order once the webhook (Task 16+) confirms Mercado Pago
  // approved the payment.
  async closeAsPaid(
    externalReference: string,
    paymentId: number,
    subscriptionId: number,
  ) {
    const order = await this.findByExternalReference(externalReference);
    if (!order) {
      throw new NotFoundException(
        `No existe una orden de cobro con referencia: ${externalReference}.`,
      );
    }
    order.status = ChargeOrderStatus.PAID;
    order.paymentId = paymentId;
    // Filled in only now: this is the subscription the confirmed payment
    // actually produced.
    order.subscriptionId = subscriptionId;
    order.updatedAt = new Date();
    return this.chargeOrderRepository.save(order);
  }

  // Closes an order Mercado Pago reported as failed. `reason` is logged for
  // diagnostics only in this task — there is no column for it yet; a later
  // task may add one if that turns out to be needed.
  async closeAsError(externalReference: string, reason: string) {
    const order = await this.findByExternalReference(externalReference);
    if (!order) {
      throw new NotFoundException(
        `No existe una orden de cobro con referencia: ${externalReference}.`,
      );
    }
    this.logger.warn(
      `Charge order ${externalReference} closed as error: ${reason}`,
    );
    order.status = ChargeOrderStatus.ERROR;
    order.updatedAt = new Date();
    return this.chargeOrderRepository.save(order);
  }

  // An admin backing out of a charge before it settled. `adminId` is accepted
  // for the caller's own audit-log purposes — there is no dedicated column
  // for it on this entity, so it is not persisted here.
  async cancel(id: number, adminId: number) {
    const order = await this.chargeOrderRepository.findOne({ where: { id } });
    if (!order) {
      throw new NotFoundException(`La orden de cobro con ID: ${id} no existe.`);
    }
    this.logger.log(`Charge order ${id} cancelled by admin ${adminId}`);
    order.status = ChargeOrderStatus.CANCELLED;
    order.updatedAt = new Date();
    return this.chargeOrderRepository.save(order);
  }

  // Bulk-flips every PENDING front-desk order past its expiresAt to EXPIRED.
  // Called at the start of createCharge rather than on its own cron, so an
  // abandoned charge never blocks the counter — see the note there. Mirrors
  // subscriptionService.expireLapsedSubscriptions's bulk update() shape.
  //
  // 'online' orders are excluded on purpose. They block no collection point,
  // so nothing is gained by sweeping them — and an in_process checkout leaves
  // its order PENDING so ChargeOrderResolverAdapter can resolve it when
  // Mercado Pago's webhook finally reports the outcome. Without this filter,
  // the next front-desk charge would expire that row (its expiresAt is only
  // five minutes out) and throw the recovery away. Skipping the sweep for the
  // online charge itself, as createCharge does, is not enough: any other
  // charge would still sweep it.
  async expireStale() {
    return this.chargeOrderRepository.update(
      {
        status: ChargeOrderStatus.PENDING,
        expiresAt: LessThan(new Date()),
        method: Not(ChargeOrderMethod.ONLINE),
      },
      { status: ChargeOrderStatus.EXPIRED, updatedAt: new Date() },
    );
  }
}
