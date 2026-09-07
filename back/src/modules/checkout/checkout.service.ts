import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { resolveTerm } from '../plan/plan-duration.rules';
import { ChargeOrderService } from '../chargeOrder/chargeOrder.service';
import { buildExternalReference } from '../chargeOrder/chargeOrder.rules';
import { ChargeOrderStatus } from '../chargeOrder/enum/chargeOrder-status.enum';
import type { MpPaymentResult } from '../mercadopago/mercadopago.client';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
} from '../mercadopago/mercadopago.client';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';
import { PaymentService } from '../payment/payment.service';
import { SavedCardService } from '../savedCard/savedCard.service';
import { isChargeable } from '../savedCard/savedCard.rules';
import { subscriptionService } from '../subscription/subscription.service';
import { MailService } from '../../common/mail/mail.service';
import {
  assessChange,
  blockMessage,
  PLAN_CHANGE_LOCK_DAYS,
} from '../subscription/plan-change.rules';
import { addDays, toDateOnly } from '../subscription/subscription.rules';
import type { CheckoutDto } from './dto/checkout-dto';
import type { CheckoutPreferenceDto } from './dto/checkout-preference-dto';
import type { CheckoutArmDto } from './dto/checkout-arm-dto';
import {
  buildSummary,
  type CheckoutResult,
  type CheckoutStatusResult,
  type CheckoutSummary,
  type PlanChangeQuote,
} from './checkout.rules';

export interface ResolvedCharge {
  amount: number;
  planDurationId: number | null;
  /** 0 marks a prorated plan change: it buys no months. */
  termMonths: number;
  /** Non-null names the subscription a prorated upgrade replaces. */
  changeFromSubscriptionId: number | null;
  /** Non-null makes the new subscription inherit this end date. */
  endDateOverride: Date | null;
}

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);

  constructor(
    private readonly planService: PlanService,
    private readonly planDurationService: PlanDurationService,
    private readonly chargeOrderService: ChargeOrderService,
    private readonly mercadoPagoClient: MercadoPagoClient,
    private readonly mercadoPagoConfig: MercadoPagoConfig,
    private readonly paymentService: PaymentService,
    private readonly savedCardService: SavedCardService,
    private readonly subscriptionService: subscriptionService,
    private readonly mailService: MailService,
  ) {}

  /** The priced summary shown on the checkout page, before anything is charged. */
  async getSummary(planId: number, months: number): Promise<CheckoutSummary> {
    const plan = await this.planService.findPlan(planId);
    if (!plan || plan.deleted) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    const durations = await this.planDurationService.findByPlan(planId);
    return buildSummary(plan, months, durations);
  }

  /**
   * The priced, member-specific quote for changing to `planId` from the
   * member's live subscription — what GET /checkout/plan-change returns and
   * what resolveCharge's plan-change mode prices a charge from. Never throws
   * for an ineligible change: the refusal is part of the quote, in Spanish,
   * so the frontend can render it without a second round trip.
   */
  async getPlanChangeQuote(
    userId: number,
    planId: number,
  ): Promise<PlanChangeQuote> {
    const plan = await this.planService.findPlan(planId);
    if (!plan || plan.deleted) {
      throw new NotFoundException(`El plan con ID: ${planId} no existe.`);
    }

    const context = await this.subscriptionService.findChangeContext(userId);
    const today = toDateOnly(new Date());
    const assessment = assessChange({
      next: plan,
      current: context?.current ?? null,
      today,
    });

    // Not `new Date(context.current.endDate)`: the value is already a
    // date-only string (or a Date TypeORM already resolved), and re-parsing a
    // 'YYYY-MM-DD' string through `new Date()` reads it as UTC midnight —
    // which shifts a day backward in Argentina (UTC-3), the same trap
    // dayAfter's own comment documents.
    const endDate = context
      ? context.current.endDate instanceof Date
        ? toDateOnly(context.current.endDate)
        : String(context.current.endDate).slice(0, 10)
      : null;

    if (!assessment.eligible) {
      // Same instanceof guard as endDate above, for the same reason: this is
      // typed Date | string, and MySQL always hands back a string today, but
      // a re-parse through String(new Date()) would be wrong if that ever
      // changes.
      const termStartDate = context
        ? context.current.termStartDate instanceof Date
          ? toDateOnly(context.current.termStartDate)
          : String(context.current.termStartDate).slice(0, 10)
        : null;

      return {
        planId,
        planName: plan.name,
        eligible: false,
        reason: assessment.reason,
        message: blockMessage(assessment.reason, {
          unlocksOn: termStartDate
            ? addDays(termStartDate, PLAN_CHANGE_LOCK_DAYS)
            : undefined,
        }),
        direction: null,
        amount: 0,
        daysRemaining: 0,
        effectiveEndDate: endDate,
      };
    }

    return {
      planId,
      planName: plan.name,
      eligible: true,
      reason: null,
      message: null,
      direction: assessment.direction,
      amount: assessment.amount,
      daysRemaining: assessment.daysRemaining,
      effectiveEndDate: endDate,
    };
  }

  /**
   * The single source of truth for what a member is about to be charged.
   *
   * createPreference, armOrder and pay MUST all go through this and none of
   * them may compute an amount of their own: the Brick renders what the
   * preference says and the member is billed what the charge says, so a second
   * derivation is a bug that shows one price and takes another.
   */
  async resolveCharge(
    userId: number,
    dto: { planId: number; months?: number; mode?: 'term' | 'plan-change' },
  ): Promise<ResolvedCharge> {
    if (dto.mode === 'plan-change') {
      const quote = await this.getPlanChangeQuote(userId, dto.planId);
      if (!quote.eligible) {
        throw new ConflictException(
          quote.message ?? 'No podés cambiar de plan.',
        );
      }
      if (quote.amount <= 0) {
        // Downgrades and lateral moves cost nothing and are applied through
        // PUT /subscription/me/plan-change. Mercado Pago cannot take a
        // zero-peso payment, so this must never reach a charge.
        throw new ConflictException(
          'Este cambio de plan no tiene costo. Aplicalo desde tu panel, sin pasar por el pago.',
        );
      }

      // Not null: an eligible quote requires findChangeContext to have
      // returned a live subscription, which is exactly what assessChange's
      // 'no_active_subscription' branch (the only branch reachable with a
      // null context) refuses before reaching here.
      const context = await this.subscriptionService.findChangeContext(userId);

      return {
        amount: quote.amount,
        planDurationId: null,
        termMonths: 0,
        changeFromSubscriptionId: context!.subscription.id,
        endDateOverride: quote.effectiveEndDate as unknown as Date,
      };
    }

    const summary = await this.getSummary(dto.planId, dto.months ?? 1);
    const plan = await this.planService.findPlan(dto.planId);
    const durations = await this.planDurationService.findByPlan(dto.planId);
    const term = resolveTerm(plan!, dto.months ?? 1, durations);

    return {
      amount: summary.total,
      planDurationId: term.planDurationId,
      termMonths: term.months,
      changeFromSubscriptionId: null,
      endDateOverride: null,
    };
  }

  /**
   * The Mercado Pago preference behind the Payment Brick's wallet option.
   *
   * Creates NO ChargeOrder: this runs on every wallet-page load and on every
   * duration change, and arming here would leave a PENDING row behind for
   * every member who browsed and left — rows nothing sweeps, since
   * expireStale() excludes 'online' by design. The row is written by
   * armOrder(), at submit time. See the spec's D4.
   */
  async createPreference(
    userId: number,
    email: string,
    dto: CheckoutPreferenceDto,
  ): Promise<{
    preferenceId: string;
    externalReference: string;
    amount: number;
  }> {
    // getSummary prices a TERM. A plan change never buys one — dto.months is
    // undefined by design in that mode (see @ValidateIf on the DTOs) — so
    // calling it unconditionally would throw before resolveCharge's
    // plan-change branch is ever reached. Only the plan's name is needed
    // here, so it is read directly instead of through a term-priced summary.
    const planName =
      dto.mode === 'plan-change'
        ? ((await this.planService.findPlan(dto.planId))?.name ?? '')
        : (await this.getSummary(dto.planId, dto.months)).planName;
    const charge = await this.resolveCharge(userId, dto);
    const externalReference = buildExternalReference(
      userId,
      randomUUID().slice(0, 8),
    );

    try {
      const preference = await this.mercadoPagoClient.createPreference({
        planName,
        amount: charge.amount,
        externalReference,
        payerEmail: email,
        frontendUrl: this.mercadoPagoConfig.frontendUrl,
        now: new Date(),
      });

      return {
        preferenceId: preference.id,
        externalReference,
        amount: charge.amount,
      };
    } catch (error) {
      if (error instanceof MercadoPagoUnavailableError) {
        // Nothing was armed and nothing was charged, so this is safe to
        // report as a plain outage. The wallet page degrades to cards only —
        // silently on the member's side, but logged here so the failure
        // still leaves a server-side trace.
        this.logger.warn(
          `Could not create the Mercado Pago preference for user ${userId}`,
          error instanceof Error ? error.stack : error,
        );
        throw new ServiceUnavailableException(
          'No pudimos preparar el pago con Mercado Pago. Podés pagar con tarjeta.',
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * Arms the ChargeOrder a wallet payment will settle against, called from
   * the Payment Brick's onSubmit immediately before it redirects the member
   * to Mercado Pago. Rejecting here cancels that redirect, which is the point:
   * a redirect that outran its own bookkeeping means Mercado Pago charging
   * against a reference nothing resolves.
   *
   * Idempotent on (member, reference) so a retried submit re-uses the row
   * rather than colliding with the column's unique constraint.
   */
  async armOrder(userId: number, dto: CheckoutArmDto): Promise<void> {
    const existing = await this.chargeOrderService.findByExternalReference(
      dto.externalReference,
    );

    if (existing) {
      // 404, not 403: a different member's reference must not be confirmed to
      // exist. Same reasoning as getStatus.
      if (existing.userId !== userId) {
        throw new NotFoundException('La orden de pago no existe.');
      }
      const pending: string = ChargeOrderStatus.PENDING;
      if (existing.status !== pending) {
        throw new ConflictException(
          'Esta orden de pago ya se cerró. Volvé a empezar el pago.',
        );
      }
      return;
    }

    // Re-priced here, never taken from the request: the browser has been away
    // to a preference and back, and D5 does not stop applying because a
    // previous endpoint already computed a price.
    const charge = await this.resolveCharge(userId, dto);

    await this.chargeOrderService.createCharge({
      userId,
      planId: dto.planId,
      // Not dto.months: it is undefined in plan-change mode. charge.termMonths
      // is resolveCharge's own resolved value — 0 for a plan change, and
      // otherwise identical to dto.months for a term sale — so this can never
      // hand createCharge an undefined months.
      months: charge.termMonths,
      amount: charge.amount,
      method: 'online',
      collectionPointId: null,
      adminId: null,
      externalReference: dto.externalReference,
      // Null for a term sale. For a plan change, resolveCharge already set
      // this to the subscription being replaced — without it this order's
      // row would resolve as an ordinary term purchase if the webhook ever
      // has to recover it via ChargeOrderResolverAdapter.
      changeFromSubscriptionId: charge.changeFromSubscriptionId,
    });
  }

  /**
   * What /checkout/return polls. This — never Mercado Pago's back_urls query
   * parameters — is the only thing allowed to say a payment succeeded. See
   * the spec's D6: deciding from `?status=approved` would grant a membership
   * to anyone who types the URL.
   */
  async getStatus(
    userId: number,
    externalReference: string,
  ): Promise<CheckoutStatusResult> {
    const order =
      await this.chargeOrderService.findByExternalReference(externalReference);

    // One 404 for "no such order" and for "not yours": a 403 on the second
    // would confirm the reference exists.
    if (!order || order.userId !== userId) {
      throw new NotFoundException('La orden de pago no existe.');
    }

    const paid: string = ChargeOrderStatus.PAID;
    const pending: string = ChargeOrderStatus.PENDING;

    if (order.status === paid) {
      return {
        status: 'approved',
        paymentId: order.paymentId ?? undefined,
        newEndDate: order.subscription
          ? String(order.subscription.endDate).slice(0, 10)
          : undefined,
        planName: order.subscription?.plan?.name,
        amount: Number(order.amount),
        months: order.termMonths,
      };
    }

    // Anything that is not paid and not still live — error, cancelled,
    // expired — is a dead end the member should be told about, not a spinner
    // that never resolves.
    return { status: order.status === pending ? 'pending' : 'rejected' };
  }

  /**
   * Charges the member for `dto.months` of `dto.planId` and, when approved,
   * records the payment and promotes their subscription.
   *
   * A declined card is a normal outcome, returned as `status: 'rejected'` —
   * only an outage or a failed write throws.
   */
  async pay(
    userId: number,
    email: string,
    dto: CheckoutDto,
  ): Promise<CheckoutResult> {
    // Same reasoning as createPreference: getSummary prices a term, which a
    // plan change never buys, so it is skipped in favour of the plan's name
    // alone in that mode.
    const planName =
      dto.mode === 'plan-change'
        ? ((await this.planService.findPlan(dto.planId))?.name ?? '')
        : (await this.getSummary(dto.planId, dto.months)).planName;
    const charge = await this.resolveCharge(userId, dto);

    const order = await this.chargeOrderService.createCharge({
      userId,
      planId: dto.planId,
      // Not dto.months — see armOrder's identical comment.
      months: charge.termMonths,
      amount: charge.amount,
      method: 'online',
      collectionPointId: null,
      adminId: null,
      // See armOrder's identical comment: without this, a synchronous
      // approval that fails before settle() finishes recovers via the
      // webhook as an ordinary term order instead of a prorated upgrade.
      changeFromSubscriptionId: charge.changeFromSubscriptionId,
    });

    let result: MpPaymentResult;
    // The Mercado Pago customer the charge was scoped to, when the member
    // asked to save their card. It is the anchor the SavedCard row hangs
    // off, and only the new-card path ever creates one.
    let customerId: string | undefined;
    try {
      if (dto.useSavedCard) {
        result = await this.chargeExistingCard(
          userId,
          charge.amount,
          planName,
          order.externalReference,
        );
      } else {
        const cardCharge = await this.chargeNewCard(
          dto,
          email,
          charge.amount,
          planName,
          order.externalReference,
        );
        result = cardCharge.result;
        customerId = cardCharge.customerId;
      }
    } catch (error) {
      if (error instanceof MercadoPagoUnavailableError) {
        await this.chargeOrderService.closeAsError(
          order.externalReference,
          error.message,
        );
        // We do not know whether anything was charged, so we say so rather
        // than implying a decline the member could "fix" by paying again.
        throw new ServiceUnavailableException(
          'No pudimos conectarnos con Mercado Pago. Volvé a intentar en unos minutos.',
        );
      }
      if (error instanceof ConflictException) {
        // No charge was ever attempted on this path, so there is no webhook
        // retry coming to let ChargeOrderResolverAdapter resolve this order
        // later — and ChargeOrderService.expireStale() now excludes 'online'
        // orders from its sweep, so leaving this one PENDING would strand it
        // forever. Closing it is safe precisely because nothing was charged.
        await this.chargeOrderService.closeAsError(
          order.externalReference,
          error.message,
        );
      }
      throw error;
    }

    if (result.status !== 'approved') {
      const reason = result.statusDetail ?? result.status ?? 'unknown';
      // Only a rejection is final. 'in_process' (e.g. pending_review_manual)
      // is still live at Mercado Pago, and the order MUST stay PENDING:
      // ChargeOrderResolverAdapter.resolve returns null for anything else, so
      // closing it here would make the approval webhook find nothing to
      // resolve — the member charged, with neither a Payment nor a promoted
      // Subscription to show for it. Online orders are excluded from
      // expireStale()'s sweep, so the row survives MP's retry window.
      if (result.status === 'rejected') {
        await this.chargeOrderService.closeAsError(
          order.externalReference,
          reason,
        );
        this.logger.warn(`Checkout declined for user ${userId}: ${reason}`);
        return { status: 'rejected', statusDetail: result.statusDetail };
      }

      this.logger.warn(
        `Checkout left in process for user ${userId}: ${reason} — order ${order.externalReference} stays pending for the webhook`,
      );
      return {
        status: result.status === 'in_process' ? 'in_process' : 'rejected',
        statusDetail: result.statusDetail,
      };
    }

    try {
      return await this.settle(
        result,
        order.externalReference,
        userId,
        dto,
        charge,
        planName,
        customerId,
      );
    } catch (error) {
      // Mercado Pago has already taken the money. The order stays PENDING on
      // purpose: ChargeOrderResolverAdapter resolves it on MP's next webhook
      // retry and the existing receiver completes the sale on its own.
      // Closing it here would make the resolver return null and throw that
      // recovery away.
      this.logger.error(
        `Checkout approved but not recorded — mpPaymentId=${result.id} userId=${userId} planId=${dto.planId} amount=${charge.amount}`,
        error instanceof Error ? error.stack : error,
      );
      throw new ServiceUnavailableException(
        'Tu pago fue aprobado pero no pudimos confirmar tu membresía. La estamos activando — vas a recibir el comprobante por email.',
      );
    }
  }

  private async chargeExistingCard(
    userId: number,
    amount: number,
    planName: string,
    externalReference: string,
  ): Promise<MpPaymentResult> {
    const card = await this.savedCardService.findActiveForUser(userId);
    if (!card || !isChargeable(card, new Date())) {
      throw new ConflictException(
        'No tenés una tarjeta guardada que se pueda usar. Ingresá una nueva.',
      );
    }

    return this.mercadoPagoClient.chargeSavedCard({
      customerId: card.mpCustomerId,
      cardId: card.mpCardId,
      amount,
      description: `Membresía FLG — ${planName}`,
      externalReference,
      idempotencyKey: `checkout-${externalReference}`,
      paymentMethodId: card.paymentMethodId,
      // isChargeable (checked above) guarantees paymentTypeId is non-null.
      paymentTypeId: card.paymentTypeId as string,
    });
  }

  // Returns the customer id alongside the charge: the caller needs it to
  // persist the card afterwards, and it is created here or nowhere.
  private async chargeNewCard(
    dto: CheckoutDto,
    email: string,
    amount: number,
    planName: string,
    externalReference: string,
  ): Promise<{ result: MpPaymentResult; customerId?: string }> {
    const token = dto.cardToken as string;
    // Scoping the payment to a customer is what attaches the card to it: the
    // token is single-use and this charge spends it, so there is no second
    // token left to save afterwards.
    const customer = dto.saveCard
      ? await this.mercadoPagoClient.findOrCreateCustomer(email)
      : undefined;

    const result = await this.mercadoPagoClient.chargeCardToken({
      token,
      amount,
      description: `Membresía FLG — ${planName}`,
      externalReference,
      idempotencyKey: `checkout-${token}`,
      customerId: customer?.id,
      payerEmail: email,
      paymentMethodId: dto.paymentMethodId as string,
      paymentTypeId: dto.paymentTypeId as string,
    });

    return { result, customerId: customer?.id };
  }

  private async settle(
    result: MpPaymentResult,
    externalReference: string,
    userId: number,
    dto: CheckoutDto,
    charge: ResolvedCharge,
    planName: string,
    customerId: string | undefined,
  ): Promise<CheckoutResult> {
    const { payment, subscription } =
      await this.paymentService.confirmPlanCharge({
        mpPaymentId: result.id,
        userId,
        planId: dto.planId,
        months: dto.months,
        amount: charge.amount,
        payMethod: 'mercadopago',
        registeredById: null,
        mpOrderId: result.mpOrderId,
        // Null for a term sale, in which case confirmPlanCharge ignores both
        // and resolves the term from months instead — see its own isPlanChange
        // branch. For a plan change, charge (resolveCharge's own output)
        // already carries the subscription being replaced and the end date
        // the new one must inherit.
        changeFromSubscriptionId: charge.changeFromSubscriptionId,
        endDateOverride: charge.endDateOverride,
      });

    await this.chargeOrderService.closeAsPaid(
      externalReference,
      payment.id,
      subscription.id,
    );

    await this.mailService.sendPaymentReceipt({
      to: subscription.user.email,
      name: subscription.user.name,
      planName: subscription.plan.name,
      amount: charge.amount,
      termMonths: dto.months,
      method: 'mercadopago',
      newEndDate: subscription.endDate,
    });

    if (dto.saveCard && dto.cardToken) {
      await this.rememberCard(userId, customerId, result.card, subscription.id);
    }

    return {
      status: 'approved',
      paymentId: payment.id,
      newEndDate: String(subscription.endDate).slice(0, 10),
      planName,
      amount: charge.amount,
      months: dto.months,
    };
  }

  // Never allowed to fail the sale: the money is taken and the membership is
  // active, so a failure here costs the member a convenience, not a purchase.
  // The response tells them to add the card from their panel instead.
  //
  // The card comes from the approved payment itself, never from a second
  // Mercado Pago call: the charge above already spent the single-use token,
  // so savedCardService.saveForUser would fail here every time — silently,
  // since this method swallows everything. Auto-renew is turned on only
  // alongside a card that actually persisted; without one it is a promise
  // the system cannot keep.
  private async rememberCard(
    userId: number,
    customerId: string | undefined,
    card: MpPaymentResult['card'],
    subscriptionId: number,
  ): Promise<void> {
    if (
      !customerId ||
      !card ||
      card.lastFourDigits === undefined ||
      card.paymentMethodId === undefined ||
      card.paymentTypeId === undefined ||
      card.expirationMonth === undefined ||
      card.expirationYear === undefined
    ) {
      this.logger.warn(
        `Approved checkout for user ${userId} carried no complete card to save; skipping the saved card`,
      );
      return;
    }

    try {
      await this.savedCardService.saveFromApprovedPayment(userId, customerId, {
        id: card.id,
        lastFourDigits: card.lastFourDigits,
        paymentMethodId: card.paymentMethodId,
        paymentTypeId: card.paymentTypeId,
        expirationMonth: card.expirationMonth,
        expirationYear: card.expirationYear,
      });
      await this.subscriptionService.setAutoRenew(subscriptionId, true);
    } catch (error) {
      this.logger.warn(
        `Could not save the card for user ${userId} after an approved checkout`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
