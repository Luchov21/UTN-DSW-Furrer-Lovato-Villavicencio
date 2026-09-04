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
import type { CheckoutDto } from './dto/checkout-dto';
import type { CheckoutPreferenceDto } from './dto/checkout-preference-dto';
import type { CheckoutArmDto } from './dto/checkout-arm-dto';
import {
  buildSummary,
  type CheckoutResult,
  type CheckoutSummary,
} from './checkout.rules';

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
    const summary = await this.getSummary(dto.planId, dto.months);
    const externalReference = buildExternalReference(
      userId,
      randomUUID().slice(0, 8),
    );

    try {
      const preference = await this.mercadoPagoClient.createPreference({
        planName: summary.planName,
        amount: summary.total,
        externalReference,
        payerEmail: email,
        frontendUrl: this.mercadoPagoConfig.frontendUrl,
        now: new Date(),
      });

      return {
        preferenceId: preference.id,
        externalReference,
        amount: summary.total,
      };
    } catch (error) {
      if (error instanceof MercadoPagoUnavailableError) {
        // Nothing was armed and nothing was charged, so this is safe to
        // report as a plain outage. The wallet page degrades to cards only.
        throw new ServiceUnavailableException(
          'No pudimos preparar el pago con Mercado Pago. Podés pagar con tarjeta.',
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
    const summary = await this.getSummary(dto.planId, dto.months);

    await this.chargeOrderService.createCharge({
      userId,
      planId: dto.planId,
      months: dto.months,
      amount: summary.total,
      method: 'online',
      collectionPointId: null,
      adminId: null,
      externalReference: dto.externalReference,
    });
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
    const summary = await this.getSummary(dto.planId, dto.months);

    const order = await this.chargeOrderService.createCharge({
      userId,
      planId: dto.planId,
      months: dto.months,
      amount: summary.total,
      method: 'online',
      collectionPointId: null,
      adminId: null,
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
          summary,
          order.externalReference,
        );
      } else {
        const charge = await this.chargeNewCard(
          dto,
          email,
          summary,
          order.externalReference,
        );
        result = charge.result;
        customerId = charge.customerId;
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
        summary,
        customerId,
      );
    } catch (error) {
      // Mercado Pago has already taken the money. The order stays PENDING on
      // purpose: ChargeOrderResolverAdapter resolves it on MP's next webhook
      // retry and the existing receiver completes the sale on its own.
      // Closing it here would make the resolver return null and throw that
      // recovery away.
      this.logger.error(
        `Checkout approved but not recorded — mpPaymentId=${result.id} userId=${userId} planId=${dto.planId} amount=${summary.total}`,
        error instanceof Error ? error.stack : error,
      );
      throw new ServiceUnavailableException(
        'Tu pago fue aprobado pero no pudimos confirmar tu membresía. La estamos activando — vas a recibir el comprobante por email.',
      );
    }
  }

  private async chargeExistingCard(
    userId: number,
    summary: CheckoutSummary,
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
      amount: summary.total,
      description: `Membresía FLG — ${summary.planName}`,
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
    summary: CheckoutSummary,
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
      amount: summary.total,
      description: `Membresía FLG — ${summary.planName}`,
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
    summary: CheckoutSummary,
    customerId: string | undefined,
  ): Promise<CheckoutResult> {
    const { payment, subscription } =
      await this.paymentService.confirmPlanCharge({
        mpPaymentId: result.id,
        userId,
        planId: dto.planId,
        months: dto.months,
        amount: summary.total,
        payMethod: 'mercadopago',
        registeredById: null,
        mpOrderId: result.mpOrderId,
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
      amount: summary.total,
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
      planName: summary.planName,
      amount: summary.total,
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
