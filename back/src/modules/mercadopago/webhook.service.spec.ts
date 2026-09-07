import { Logger, NotFoundException } from '@nestjs/common';
import {
  WebhookService,
  OrderResolver,
  ResolvedOrder,
} from './webhook.service';

describe('WebhookService.handleNotification', () => {
  let client: { getPayment: jest.Mock; getOrder: jest.Mock };
  let orderResolver: OrderResolver & { resolve: jest.Mock; close: jest.Mock };
  let paymentService: {
    findByMpPaymentId: jest.Mock;
    confirmPlanCharge: jest.Mock;
  };
  let mailService: { sendPaymentReceipt: jest.Mock };
  let service: WebhookService;

  // A front-desk charge order: has a registeredById (the admin who started
  // it at the counter). An online renewal's resolved order has none — see
  // the dedicated test below for that case.
  const resolvedOrder: ResolvedOrder = {
    userId: 3,
    planId: 12,
    termMonths: 3,
    amount: 14000,
    payMethod: 'point',
    registeredById: 30111222,
  };

  const confirmedCharge = {
    payment: { id: 77 },
    subscription: {
      id: 88,
      user: { email: 'a@b.c', name: 'Ana' },
      plan: { name: 'Plan Test' },
      endDate: '2026-12-01',
    },
  };

  const buildService = () => {
    service = new WebhookService(
      client as never,
      orderResolver,
      paymentService as never,
      mailService as never,
    );
  };

  beforeEach(() => {
    client = { getPayment: jest.fn(), getOrder: jest.fn() };
    client.getPayment.mockResolvedValue({
      id: 'mp-1',
      status: 'approved',
      transactionAmount: 14000,
      externalReference: 'order-1',
    });
    orderResolver = {
      resolve: jest.fn().mockResolvedValue(resolvedOrder),
      close: jest.fn().mockResolvedValue(undefined),
    };
    paymentService = {
      findByMpPaymentId: jest.fn().mockResolvedValue(null),
      confirmPlanCharge: jest.fn().mockResolvedValue(confirmedCharge),
    };
    mailService = {
      sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
    };
    buildService();
  });

  it('creates the subscription and payment when the charge is approved', async () => {
    await service.handleNotification('mp-1', 'payment');

    expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        mpPaymentId: 'mp-1',
        userId: 3,
        planId: 12,
        months: 3,
        amount: 14000,
        payMethod: 'point',
        registeredById: 30111222,
      }),
    );
    expect(orderResolver.close).toHaveBeenCalledWith('order-1', 77, 88);
  });

  it('passes changeFromSubscriptionId/endDateOverride through for a prorated upgrade', async () => {
    orderResolver.resolve.mockResolvedValue({
      ...resolvedOrder,
      termMonths: 0,
      changeFromSubscriptionId: 10,
      endDateOverride: '2026-03-31',
    });

    await service.handleNotification('mp-1', 'payment');

    expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        changeFromSubscriptionId: 10,
        endDateOverride: '2026-03-31',
      }),
    );
  });

  // Final-review Important finding: a prorated plan change settled
  // asynchronously (Point/QR/wallet) through this webhook must not leak
  // resolved.termMonths (0 for a plan change) into the receipt as a literal
  // "0 meses" — the mail service must see null instead.
  it('sends the receipt with termMonths null for a prorated upgrade settled through the webhook', async () => {
    orderResolver.resolve.mockResolvedValue({
      ...resolvedOrder,
      termMonths: 0,
      changeFromSubscriptionId: 10,
      endDateOverride: '2026-03-31',
    });

    await service.handleNotification('mp-1', 'payment');

    expect(mailService.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ termMonths: null }),
    );
  });

  it('passes null changeFromSubscriptionId/endDateOverride for an ordinary term order', async () => {
    await service.handleNotification('mp-1', 'payment');

    expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        changeFromSubscriptionId: null,
        endDateOverride: null,
      }),
    );
  });

  it('does not create anything when the amount does not match the snapshot', async () => {
    client.getPayment.mockResolvedValue({
      id: 'mp-underpaid',
      status: 'approved',
      transactionAmount: 100,
      externalReference: 'order-1',
    });

    await service.handleNotification('mp-underpaid', 'payment');

    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    expect(orderResolver.close).not.toHaveBeenCalled();
  });

  it('sends the payment receipt after the charge is confirmed', async () => {
    await service.handleNotification('mp-1', 'payment');

    expect(mailService.sendPaymentReceipt).toHaveBeenCalledWith({
      to: 'a@b.c',
      name: 'Ana',
      planName: 'Plan Test',
      amount: 14000,
      termMonths: 3,
      method: 'point',
      newEndDate: '2026-12-01',
    });
  });

  // An online renewal's resolved order has no registeredById — nobody at a
  // counter started it. That must reach the payment write as null, not
  // undefined or a crash.
  it('maps an absent registeredById to null for an online renewal', async () => {
    orderResolver.resolve.mockResolvedValue({
      ...resolvedOrder,
      registeredById: undefined,
    });

    await service.handleNotification('mp-1', 'payment');

    expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({ registeredById: null }),
    );
  });

  it('lets a missing plan fail loudly instead of silently closing the order', async () => {
    paymentService.confirmPlanCharge.mockRejectedValue(
      new NotFoundException('El plan con ID: 12 no existe.'),
    );

    await expect(
      service.handleNotification('mp-1', 'payment'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orderResolver.close).not.toHaveBeenCalled();
  });

  // MP retries at 0, 15min, 30min, 6h, 48h, 96h... a non-2xx for "already
  // handled" would earn four days of pointless retries — so this must
  // resolve normally (200), not throw, while writing nothing new.
  it('answers 200 and writes nothing for a payment it already recorded', async () => {
    client.getPayment.mockResolvedValue({
      id: 'mp-already',
      status: 'approved',
      transactionAmount: 15000,
      externalReference: 'order-1',
    });
    paymentService.findByMpPaymentId.mockResolvedValue({
      id: 999,
      subscriptionId: 55,
    });
    // The order was already closed by the delivery that recorded the payment,
    // so resolve() reports nothing left to do (its own status check).
    orderResolver.resolve.mockResolvedValue(null);

    await expect(
      service.handleNotification('mp-already'),
    ).resolves.toBeUndefined();

    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    expect(mailService.sendPaymentReceipt).not.toHaveBeenCalled();
    // resolve() IS consulted — it is the idempotent probe for "does this
    // order still need closing" — but with the order already closed there is
    // nothing to close a second time.
    expect(orderResolver.close).not.toHaveBeenCalled();
  });

  // The stuck-order recovery path. If a prior delivery wrote the Payment and
  // then failed inside close(), every later retry would otherwise short-circuit
  // on the idempotency check and never close the order — it would sit 'pendiente',
  // blocking its collection point, until expireStale timed it out.
  describe('retry after a Payment was recorded but the order never closed', () => {
    beforeEach(() => {
      client.getPayment.mockResolvedValue({
        id: 'mp-stuck',
        status: 'approved',
        transactionAmount: 15000,
        externalReference: 'order-1',
      });
      paymentService.findByMpPaymentId.mockResolvedValue({
        id: 999,
        subscriptionId: 55,
      });
    });

    it('closes the order using the already-recorded payment id', async () => {
      // resolve() returns non-null only while the order is still 'pendiente'.
      orderResolver.resolve.mockResolvedValue(resolvedOrder);

      await service.handleNotification('mp-stuck');

      expect(orderResolver.resolve).toHaveBeenCalledWith('order-1');
      expect(orderResolver.close).toHaveBeenCalledWith('order-1', 999, 55);
      // Still no second Payment row and no second receipt.
      expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
      expect(mailService.sendPaymentReceipt).not.toHaveBeenCalled();
    });

    it('does not close an order that is already closed', async () => {
      orderResolver.resolve.mockResolvedValue(null);

      await service.handleNotification('mp-stuck');

      expect(orderResolver.close).not.toHaveBeenCalled();
    });

    it('does not throw when close() fails again on the retry', async () => {
      // Throwing here would only earn another MP retry that lands right back
      // on this branch — the Payment is already durably recorded either way.
      orderResolver.resolve.mockResolvedValue(resolvedOrder);
      orderResolver.close.mockRejectedValue(new Error('connection lost'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        service.handleNotification('mp-stuck'),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Retry could not close the order'),
      );
      warn.mockRestore();
    });
  });

  // handleNotification's only parameter is the already-verified dataId —
  // there is no code path here that reads a status or amount from anywhere
  // other than client.getPayment's response. This pins that the re-fetched
  // result is what governs, exactly as it must if a delivery's own claimed
  // status/amount (approved / 50000, say) disagreed with what Mercado Pago's
  // API actually reports for that payment (rejected / 100 here).
  it('re-fetches the payment from the API instead of trusting the body', async () => {
    client.getPayment.mockResolvedValue({
      id: 'mp-mismatch',
      status: 'rejected',
      transactionAmount: 100,
      externalReference: 'order-1',
    });

    await service.handleNotification('mp-mismatch');

    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
  });

  it('answers 200 for a status it does not act on, such as in_process', async () => {
    client.getPayment.mockResolvedValue({
      id: 'mp-pending',
      status: 'in_process',
      transactionAmount: 14000,
      externalReference: 'order-1',
    });

    await expect(
      service.handleNotification('mp-pending'),
    ).resolves.toBeUndefined();

    expect(paymentService.findByMpPaymentId).not.toHaveBeenCalled();
    expect(orderResolver.resolve).not.toHaveBeenCalled();
    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
  });

  // The placeholder OrderResolver bound in MercadoPagoWebhookModule always
  // resolves null — this is what makes that safe: an unresolvable order is
  // a no-op, not a crash.
  it('answers 200 and writes nothing when the order cannot be resolved', async () => {
    client.getPayment.mockResolvedValue({
      id: 'mp-unresolved',
      status: 'approved',
      transactionAmount: 14000,
      externalReference: 'order-unknown',
    });
    orderResolver.resolve.mockResolvedValue(null);

    await expect(
      service.handleNotification('mp-unresolved'),
    ).resolves.toBeUndefined();

    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    expect(orderResolver.close).not.toHaveBeenCalled();
  });

  // Point/QR front-desk charges are created via the Orders API
  // (MercadoPagoClient.createOrder), so Mercado Pago notifies them under the
  // `order` topic with an ORDER id, not a legacy Payments API payment id —
  // a completely different resource namespace. Passing that id to
  // getPayment (the `payment`-topic path above) 404s in production; this
  // describe block exercises the getOrder-based path instead.
  describe('an order-topic notification (Point/QR front-desk charges)', () => {
    it('records an approved order and activates the subscription', async () => {
      client.getOrder.mockResolvedValue({
        id: 'ORD01',
        status: 'processed',
        statusDetail: 'accredited',
        totalPaidAmount: 14000,
        externalReference: 'order-1',
        paymentId: 'PAY01',
      });

      await service.handleNotification('ORD01', 'order');

      expect(client.getOrder).toHaveBeenCalledWith('ORD01');
      expect(client.getPayment).not.toHaveBeenCalled();
      expect(orderResolver.resolve).toHaveBeenCalledWith('order-1');
      expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          mpPaymentId: 'PAY01',
          userId: 3,
          planId: 12,
          months: 3,
          amount: 14000,
          payMethod: 'point',
          registeredById: 30111222,
        }),
      );
      expect(orderResolver.close).toHaveBeenCalledWith('order-1', 77, 88);
    });

    it('answers 200 for an order status it does not act on, such as created', async () => {
      client.getOrder.mockResolvedValue({
        id: 'ORD02',
        status: 'created',
        totalPaidAmount: 14000,
        externalReference: 'order-1',
        paymentId: 'PAY02',
      });

      await expect(
        service.handleNotification('ORD02', 'order'),
      ).resolves.toBeUndefined();

      expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    });

    it('answers 200 and writes nothing for an order with no transaction yet', async () => {
      client.getOrder.mockResolvedValue({
        id: 'ORD03',
        status: 'created',
        externalReference: 'order-1',
        paymentId: undefined,
      });

      await expect(
        service.handleNotification('ORD03', 'order'),
      ).resolves.toBeUndefined();

      expect(orderResolver.resolve).not.toHaveBeenCalled();
      expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    });

    it('carries the order id through as mpOrderId', async () => {
      client.getOrder.mockResolvedValue({
        id: 'ORD01',
        status: 'processed',
        statusDetail: 'accredited',
        externalReference: 'order-1',
        totalPaidAmount: 14000,
        paymentId: 'mp-order-pay-1',
      });
      orderResolver.resolve.mockResolvedValue({
        userId: 3,
        planId: 12,
        termMonths: 1,
        amount: 14000,
        payMethod: 'qr',
      });
      paymentService.findByMpPaymentId.mockResolvedValue(null);
      paymentService.confirmPlanCharge.mockResolvedValue({
        payment: { id: 90 },
        subscription: { id: 44, endDate: '2026-10-02', user: {}, plan: {} },
      });

      await service.handleNotification('ORD01', 'order');

      expect(paymentService.confirmPlanCharge).toHaveBeenCalledWith(
        expect.objectContaining({ mpOrderId: 'ORD01' }),
      );
    });

    it('maps a failed order to rejected (does not record a payment)', async () => {
      client.getOrder.mockResolvedValue({
        id: 'ORD04',
        status: 'failed',
        statusDetail: 'cc_rejected_other_reason',
        externalReference: 'order-1',
        paymentId: 'mp-order-pay-4',
      });

      await service.handleNotification('ORD04', 'order');

      expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
    });
  });

  it('answers 200 and writes nothing for an unhandled notification topic', async () => {
    await expect(
      service.handleNotification('some-id', 'merchant_order'),
    ).resolves.toBeUndefined();

    expect(client.getPayment).not.toHaveBeenCalled();
    expect(client.getOrder).not.toHaveBeenCalled();
    expect(paymentService.confirmPlanCharge).not.toHaveBeenCalled();
  });
});
