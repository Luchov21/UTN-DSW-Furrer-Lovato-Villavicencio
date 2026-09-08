import { Injectable } from '@nestjs/common';
import { ChargeOrderService } from './chargeOrder.service';
import { ChargeOrderMethod } from './enum/chargeOrder-method.enum';
import { ChargeOrderStatus } from './enum/chargeOrder-status.enum';
import type {
  OrderResolver,
  ResolvedOrder,
} from '../mercadopago/webhook.service';

/**
 * Real `OrderResolver` for front-desk card/QR charges, backed by
 * `ChargeOrderService`. Bound to `ORDER_RESOLVER` in
 * `MercadoPagoWebhookModule`, replacing the always-null placeholder that
 * shipped before this order type existed.
 *
 * A separate class rather than an inline factory closure — easier to
 * unit-test in isolation, same reasoning as every other adapter in this
 * codebase.
 */
@Injectable()
export class ChargeOrderResolverAdapter implements OrderResolver {
  constructor(private readonly chargeOrderService: ChargeOrderService) {}

  async resolve(externalReference: string): Promise<ResolvedOrder | null> {
    const chargeOrder =
      await this.chargeOrderService.findByExternalReference(externalReference);

    // A resolved-but-already-closed (paid) or cancelled/expired/errored order
    // must NOT resolve again — only a still-live 'pendiente' order is a valid
    // target. WebhookService's own idempotency check on mpPaymentId already
    // covers a retried delivery of a notification already recorded; this
    // check instead guards against acting on an order this side closed for
    // some other reason (cancelled at the counter, expired) while a stale MP
    // notification for it is still in flight.
    const pendingStatus: string = ChargeOrderStatus.PENDING;
    if (!chargeOrder || chargeOrder.status !== pendingStatus) {
      return null;
    }

    // An online checkout can be recorded by either path — CheckoutService
    // synchronously, or here when the webhook completes an order that path
    // could not finish — and the same purchase must not get two different
    // labels in the dashboard's "Método" column depending on which one won.
    // CheckoutService writes 'mercadopago' (as the renewal cron does), so
    // that is the label. 'point' and 'qr' stay as they are: those are only
    // ever recorded here, and the distinction between the terminal and the
    // caja is real front-desk information the analytics breakdown reports on.
    const onlineMethod: string = ChargeOrderMethod.ONLINE;
    const payMethod =
      chargeOrder.method === onlineMethod ? 'mercadopago' : chargeOrder.method;

    // Undefined (not null) when this isn't a plan change, so it drops out of
    // a `toEqual` comparison exactly like every other optional ResolvedOrder
    // field the existing tests assert on — see PaymentService.confirmPlanCharge's
    // own isPlanChange check, which reads `!= null` either way.
    const changeFromSubscriptionId =
      chargeOrder.changeFromSubscriptionId ?? undefined;
    const endDateOverride = changeFromSubscriptionId
      ? await this.chargeOrderService.findSubscriptionEndDate(
          changeFromSubscriptionId,
        )
      : undefined;

    return {
      userId: chargeOrder.userId,
      planId: chargeOrder.planId,
      termMonths: chargeOrder.termMonths,
      amount: chargeOrder.amount,
      payMethod,
      registeredById: chargeOrder.createdById,
      changeFromSubscriptionId,
      endDateOverride,
    };
  }

  async close(
    externalReference: string,
    paymentId: number,
    subscriptionId: number,
  ): Promise<void> {
    await this.chargeOrderService.closeAsPaid(
      externalReference,
      paymentId,
      subscriptionId,
    );
  }
}
