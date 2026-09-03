import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { ChargeOrderService } from '../chargeOrder/chargeOrder.service';
import type { MpPaymentResult } from '../mercadopago/mercadopago.client';
import { MercadoPagoClient } from '../mercadopago/mercadopago.client';
import { PaymentService } from '../payment/payment.service';
import { SavedCardService } from '../savedCard/savedCard.service';
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

    const result = await this.mercadoPagoClient.chargeCardToken({
      token: dto.cardToken as string,
      amount: summary.total,
      description: `Membresía FLG — ${summary.planName}`,
      externalReference: order.externalReference,
      // The token is single-use, so it is already unique per attempt: a
      // double-tap on Pagar cannot become two charges.
      idempotencyKey: `checkout-${dto.cardToken as string}`,
      payerEmail: email,
    });

    return this.settle(result, order.externalReference, userId, dto, summary);
  }

  private async settle(
    result: MpPaymentResult,
    externalReference: string,
    userId: number,
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

    return {
      status: 'approved',
      paymentId: payment.id,
      newEndDate: String(subscription.endDate).slice(0, 10),
      planName: summary.planName,
      amount: summary.total,
      months: dto.months,
    };
  }
}
