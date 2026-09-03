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
import type { MpPaymentResult } from '../mercadopago/mercadopago.client';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
} from '../mercadopago/mercadopago.client';
import { PaymentService } from '../payment/payment.service';
import { SavedCardService } from '../savedCard/savedCard.service';
import { isChargeable } from '../savedCard/savedCard.rules';
import { subscriptionService } from '../subscription/subscription.service';
import { MailService } from '../../common/mail/mail.service';
import type { CheckoutDto } from './dto/checkout-dto';
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
    try {
      result = dto.useSavedCard
        ? await this.chargeExistingCard(
            userId,
            summary,
            order.externalReference,
          )
        : await this.chargeNewCard(
            dto,
            email,
            summary,
            order.externalReference,
          );
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
        // later — and 'online' orders skip the expireStale() sweep (Task 2),
        // so leaving it PENDING here would strand it forever. Closing it is
        // safe precisely because nothing was charged.
        await this.chargeOrderService.closeAsError(
          order.externalReference,
          error.message,
        );
      }
      throw error;
    }

    if (result.status !== 'approved') {
      await this.chargeOrderService.closeAsError(
        order.externalReference,
        result.statusDetail ?? result.status ?? 'unknown',
      );
      this.logger.warn(
        `Checkout declined for user ${userId}: ${result.statusDetail ?? result.status ?? 'unknown'}`,
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
        email,
        dto,
        summary,
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
      idempotencyKey: `checkout-${externalReference}`,
    });
  }

  private async chargeNewCard(
    dto: CheckoutDto,
    email: string,
    summary: CheckoutSummary,
    externalReference: string,
  ): Promise<MpPaymentResult> {
    const token = dto.cardToken as string;
    // Scoping the payment to a customer is what attaches the card to it: the
    // token is single-use and this charge spends it, so there is no second
    // token left to save afterwards.
    const customer = dto.saveCard
      ? await this.mercadoPagoClient.findOrCreateCustomer(email)
      : undefined;

    return this.mercadoPagoClient.chargeCardToken({
      token,
      amount: summary.total,
      description: `Membresía FLG — ${summary.planName}`,
      externalReference,
      idempotencyKey: `checkout-${token}`,
      customerId: customer?.id,
      payerEmail: email,
    });
  }

  private async settle(
    result: MpPaymentResult,
    externalReference: string,
    userId: number,
    email: string,
    dto: CheckoutDto,
    summary: CheckoutSummary,
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
      await this.rememberCard(userId, email, dto.cardToken, subscription.id);
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
  private async rememberCard(
    userId: number,
    email: string,
    cardToken: string,
    subscriptionId: number,
  ): Promise<void> {
    try {
      await this.savedCardService.saveForUser(userId, email, cardToken);
      await this.subscriptionService.setAutoRenew(subscriptionId, true);
    } catch (error) {
      this.logger.warn(
        `Could not save the card for user ${userId} after an approved checkout`,
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
