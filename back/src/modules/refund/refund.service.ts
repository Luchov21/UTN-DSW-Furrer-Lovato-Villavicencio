import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentService } from '../payment/payment.service';
import { subscriptionService } from '../subscription/subscription.service';
import { MercadoPagoClient } from '../mercadopago/mercadopago.client';
import { MailService } from '../../common/mail/mail.service';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';
import { PaymentState } from '../payment/enum/payment-state.enum';
import { Payment } from '../payment/entity/payment.entity';
import { Subscription } from '../subscription/entity/subscription.entity';
import { monthsUsed, refundAmount } from './refund.rules';
import { RefundQuoteDto } from './dto/refund-dto';

// Admin-only pro-rata refunds and cancellation. The one property that
// matters most in this file is ORDERING: money must actually move (or be
// confirmed as cash, needing no Mercado Pago call) before any local state
// says "refunded" — see `issue` below.
@Injectable()
export class RefundService {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly subscriptionService: subscriptionService,
    private readonly mercadoPagoClient: MercadoPagoClient,
    private readonly mailService: MailService,
  ) {}

  // Pure read: the admin screen shows this BEFORE anything happens. No
  // state is written, and Mercado Pago is never called here — only `issue`
  // (below) moves money.
  async quote(subscriptionId: number): Promise<RefundQuoteDto> {
    const { subscription, payment } = await this.lookup(subscriptionId);
    return this.computeQuote(subscription, payment);
  }

  // The money-moving path. ORDER MATTERS, in two layers:
  //  1. When the payment being refunded came from Mercado Pago, the refund
  //     call happens FIRST — and if it throws, execution stops right there.
  //     Nothing below that call runs: no Payment or Subscription row is
  //     touched, and no email is sent. A member whose membership was
  //     cancelled but whose money never actually moved is the worst
  //     possible outcome this method could produce, so there is no code
  //     path that writes REFUNDED/CANCELLED before the Mercado Pago call
  //     has resolved successfully (or wasn't needed at all — cash, or a $0
  //     refund skip the call entirely, both below).
  //  2. Of the two local writes that follow, the subscription is saved
  //     BEFORE the payment. See the comment at that line for why that
  //     order — not the more "obvious" payment-first one — is the safer
  //     partial-failure mode.
  async issue(subscriptionId: number, adminId: number): Promise<Payment> {
    const { subscription, payment } = await this.lookup(subscriptionId);

    if (payment.refundedAt) {
      throw new ConflictException('Este pago ya fue reembolsado.');
    }

    const { refundAmount: amount, monthsUsed: months } = this.computeQuote(
      subscription,
      payment,
    );

    // mpPaymentId, not payMethod, is what decides whether money has to move
    // through Mercado Pago: payMethod is a free-form string written by
    // different callers ('efectivo', 'debito', 'mercadopago', ...), while
    // mpPaymentId is only ever set on a payment that actually went through
    // MP (see Payment.entity.ts). A $0 refund also skips the call — there is
    // nothing to refund through Mercado Pago even for an MP-sourced payment.
    if (payment.mpPaymentId && amount > 0) {
      // Throws MercadoPagoUnavailableError (or lets any other error
      // propagate) on any failure — see mercadopago.client.ts. Nothing below
      // this line executes when it throws: that is the entire point of
      // calling it before any local write.
      //
      // mpOrderId decides which endpoint the refund needs: a payment from
      // chargeCardToken/chargeSavedCard (Orders API) only refunds through
      // POST /v1/orders/{order_id}/refund, keyed on the order id with the
      // transaction id in the body — the classic
      // POST /v1/payments/{id}/refunds refundPayment uses rejects an Orders
      // API transaction id. A payment with no mpOrderId (Point/QR, or a
      // payment predating this migration) keeps using refundPayment exactly
      // as before.
      if (payment.mpOrderId) {
        await this.mercadoPagoClient.refundOrder(
          payment.mpOrderId,
          payment.mpPaymentId,
          amount,
          `refund-${payment.id}`,
        );
      } else {
        await this.mercadoPagoClient.refundPayment(
          payment.mpPaymentId,
          amount,
          `refund-${payment.id}`,
        );
      }
    }

    // Only reached once the money has actually moved (or didn't need to).
    // Subscription cancellation is written FIRST, payment-refunded second —
    // deliberately the opposite of "obvious" read order, because it's the
    // safer of the two possible partial-failure orderings. If
    // subscriptionService.save throws here, nothing local has changed yet:
    // the worst case is "money moved at MP but no local state reflects it",
    // recoverable by retrying (refundPayment's idempotency key means a
    // retry doesn't double-refund at MP). The other order — payment marked
    // REFUNDED first — has a strictly worse failure mode: if the
    // subscription save then failed, the payment would read "refunded, all
    // good" while the subscription stayed ACTIVE with autoRenew possibly
    // still true, risking the renewal cron charging an already-refunded
    // member again. See task-18-report.md's fix entry for the full
    // reasoning.
    const refundedAt = new Date();
    subscription.state = SubscriptionState.CANCELLED;
    subscription.autoRenew = false;
    await this.subscriptionService.save(subscription);

    payment.refundedAmount = amount;
    payment.refundedAt = refundedAt;
    payment.refundedById = adminId;
    payment.state = PaymentState.REFUNDED;
    const savedPayment = await this.paymentService.save(payment);

    await this.mailService.sendRefundConfirmation({
      to: subscription.user.email,
      name: subscription.user.name,
      refundedAmount: amount,
      monthsCharged: months,
      cancelledOn: refundedAt,
    });

    return savedPayment;
  }

  // Shared by quote and issue: the subscription and the payment currently
  // "in force" against it. 404s for either — never a confusing error — so
  // an admin screen that shows this before the payment always gets a clean
  // response.
  private async lookup(subscriptionId: number) {
    const subscription =
      await this.subscriptionService.findSubscription(subscriptionId);
    if (!subscription || subscription.deleted) {
      throw new NotFoundException(
        `La suscripción con ID: ${subscriptionId} no existe.`,
      );
    }

    const payment =
      await this.paymentService.findCurrentTermPayment(subscriptionId);
    if (!payment) {
      throw new NotFoundException(
        'No hay ningún pago activo para reembolsar en esta suscripción.',
      );
    }

    return { subscription, payment };
  }

  // Pure arithmetic + the human-readable zero-refund reason. Kept in the
  // service (not refund.rules.ts, which stays pure arithmetic only) because
  // the reason string is Spanish UI copy, not a business rule.
  private computeQuote(
    subscription: Subscription,
    payment: Payment,
  ): RefundQuoteDto {
    const months = monthsUsed(
      subscription.startDate,
      new Date(),
      subscription.plan.numDays,
    );

    // totalPaid is payment.amount — the actual amount charged for this
    // term — not termMonths * monthlyPriceAtPurchase recomputed, which
    // would silently ignore any per-payment discount/override.
    // regularMonthlyPrice is the snapshotted monthlyPriceAtPurchase, never
    // today's plan.price, which may have changed since the sale.
    const amount = refundAmount({
      totalPaid: payment.amount,
      monthsUsed: months,
      regularMonthlyPrice: payment.monthlyPriceAtPurchase,
    });

    const reason =
      amount === 0
        ? `Ya se consumieron ${months} meses a $${payment.monthlyPriceAtPurchase} — el monto pagado no cubre eso.`
        : null;

    return {
      subscriptionId: subscription.id,
      paymentId: payment.id,
      totalPaid: payment.amount,
      monthsUsed: months,
      regularMonthlyPrice: payment.monthlyPriceAtPurchase,
      refundAmount: amount,
      reason,
    };
  }
}
