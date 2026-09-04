import { ConflictException, NotFoundException } from '@nestjs/common';
import { RefundService } from './refund.service';
import { MercadoPagoUnavailableError } from '../mercadopago/mercadopago.client';
import { PaymentState } from '../payment/enum/payment-state.enum';
import { SubscriptionState } from '../subscription/enum/subscription-state.enum';

describe('RefundService', () => {
  let paymentService: {
    findCurrentTermPayment: jest.Mock;
    save: jest.Mock;
  };
  let subscriptionService: {
    findSubscription: jest.Mock;
    save: jest.Mock;
  };
  let mercadoPagoClient: { refundPayment: jest.Mock; refundOrder: jest.Mock };
  let mailService: { sendRefundConfirmation: jest.Mock };
  let service: RefundService;

  // A year (12 months) bought for 100000 at a regular rate of 10000/month,
  // 3 months in — same numbers as refund.rules.spec.ts's example, so the
  // service-level math is easy to cross-check: 100000 - 3*10000 = 70000.
  const buildSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: 7,
    userId: 42,
    deleted: false,
    startDate: '2026-01-01',
    state: SubscriptionState.ACTIVE,
    autoRenew: true,
    plan: { id: 1, name: 'Anual', price: 12000, numDays: 30 },
    user: { id: 42, email: 'member@example.com', name: 'Ana' },
    ...overrides,
  });

  const buildPayment = (overrides: Record<string, unknown> = {}) => ({
    id: 55,
    subscriptionId: 7,
    amount: 100000,
    termMonths: 12,
    monthlyPriceAtPurchase: 10000,
    state: PaymentState.COMPLETED,
    mpPaymentId: null as string | null,
    mpOrderId: null as string | null,
    refundedAt: null as Date | null,
    refundedAmount: null as number | null,
    refundedById: null as number | null,
    ...overrides,
  });

  const buildService = () => {
    service = new RefundService(
      paymentService as never,
      subscriptionService as never,
      mercadoPagoClient as never,
      mailService as never,
    );
  };

  beforeEach(() => {
    paymentService = {
      findCurrentTermPayment: jest.fn(),
      save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    };
    subscriptionService = {
      findSubscription: jest.fn(),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };
    mercadoPagoClient = {
      refundPayment: jest
        .fn()
        .mockResolvedValue({ id: 'mp-refund-1', status: 'approved' }),
      refundOrder: jest.fn(),
    };
    mailService = {
      sendRefundConfirmation: jest.fn().mockResolvedValue(undefined),
    };
    buildService();
  });

  describe('quote', () => {
    // '2026-01-01' + 90 days at a 30-day plan lands 3 months in.
    const today = new Date('2026-04-01T00:00:00');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(today);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('computes the refund without writing anything', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      const result = await service.quote(7);

      expect(result.refundAmount).toBe(70000);
      expect(result.monthsUsed).toBe(3);
      expect(paymentService.save).not.toHaveBeenCalled();
      expect(subscriptionService.save).not.toHaveBeenCalled();
      expect(mercadoPagoClient.refundPayment).not.toHaveBeenCalled();
      expect(mailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    it('reports zero with a reason rather than refusing', async () => {
      // 12 months used (2025-05-01 to 2026-04-01 at a 30-day plan) against a
      // 12-month term paid at a discount: consumed more, at the regular
      // rate, than was ever paid.
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription({ startDate: '2025-05-01' }),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      const result = await service.quote(7);

      expect(result.refundAmount).toBe(0);
      expect(result.reason).toEqual(expect.any(String));
      expect(result.reason).not.toBe('');
    });

    it('reads the snapshotted monthlyPriceAtPurchase, not today’s plan price', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription({
          plan: { id: 1, name: 'Anual', price: 99999, numDays: 30 },
        }),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      const result = await service.quote(7);

      // Uses monthlyPriceAtPurchase (10000), not the plan's current price
      // (99999): 100000 - 3*10000 = 70000, not a wildly different number.
      expect(result.regularMonthlyPrice).toBe(10000);
      expect(result.refundAmount).toBe(70000);
    });

    it('404s when the subscription does not exist', async () => {
      subscriptionService.findSubscription.mockResolvedValue(null);

      await expect(service.quote(999)).rejects.toThrow(NotFoundException);
    });

    it('404s (not a confusing error) when there is nothing to refund', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(null);

      await expect(service.quote(7)).rejects.toThrow(NotFoundException);
    });
  });

  describe('issue', () => {
    const today = new Date('2026-04-01T00:00:00');

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(today);
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('calls Mercado Pago for a card or QR payment and marks it REFUNDED', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: 'mp-pay-1' }),
      );

      const result = await service.issue(7, 900);

      expect(mercadoPagoClient.refundPayment).toHaveBeenCalledWith(
        'mp-pay-1',
        70000,
        'refund-55',
      );
      expect(paymentService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: PaymentState.REFUNDED,
          refundedAmount: 70000,
          refundedById: 900,
        }),
      );
      expect(result.state).toBe(PaymentState.REFUNDED);
    });

    it('refunds through the Orders API when the payment carries an mpOrderId', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: 'PAY01', mpOrderId: 'ORD01' }),
      );
      mercadoPagoClient.refundOrder = jest
        .fn()
        .mockResolvedValue({ id: 'ORD01', status: 'processed' });

      await service.issue(7, 900);

      expect(mercadoPagoClient.refundOrder).toHaveBeenCalledWith(
        'ORD01',
        'PAY01',
        70000,
        'refund-55',
      );
      expect(mercadoPagoClient.refundPayment).not.toHaveBeenCalled();
    });

    it('makes no MP call for a cash payment', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: null }),
      );

      await service.issue(7, 900);

      expect(mercadoPagoClient.refundPayment).not.toHaveBeenCalled();
      expect(paymentService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: PaymentState.REFUNDED,
          refundedAmount: 70000,
        }),
      );
      expect(subscriptionService.save).toHaveBeenCalled();
    });

    it('leaves the subscription ACTIVE when the MP refund call fails', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: 'mp-pay-1' }),
      );
      mercadoPagoClient.refundPayment.mockRejectedValue(
        new MercadoPagoUnavailableError('Mercado Pago is down'),
      );

      await expect(service.issue(7, 900)).rejects.toThrow(
        MercadoPagoUnavailableError,
      );

      // Nothing marked REFUNDED, nothing cancelled, no email — the worst
      // outcome (money never moved but access was cut) must be unreachable.
      expect(paymentService.save).not.toHaveBeenCalled();
      expect(subscriptionService.save).not.toHaveBeenCalled();
      expect(mailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    // The subscription is saved BEFORE the payment is marked REFUNDED —
    // deliberately the less "obvious" order. If subscriptionService.save
    // fails (a transient DB error, say) after a successful MP call, this
    // ordering means the payment is never left reading "refunded, all
    // good" while the subscription is still ACTIVE with autoRenew
    // possibly still true, which would otherwise risk the renewal cron
    // charging an already-refunded member again.
    it('never marks the payment REFUNDED when cancelling the subscription fails', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: 'mp-pay-1' }),
      );
      subscriptionService.save.mockRejectedValue(new Error('DB is down'));

      await expect(service.issue(7, 900)).rejects.toThrow('DB is down');

      // The MP call still happened (money already moved at MP) — only the
      // local write is left unresolved, which is the safer half of the
      // partial-failure to have unresolved.
      expect(mercadoPagoClient.refundPayment).toHaveBeenCalled();
      expect(paymentService.save).not.toHaveBeenCalled();
      expect(mailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    // Same ordering guarantee, but for the cash/skipped-MP-call path: even
    // with no MP call to fail, the subscription save must still land before
    // the payment save.
    it('never marks the payment REFUNDED when cancelling the subscription fails, even for cash', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: null }),
      );
      subscriptionService.save.mockRejectedValue(new Error('DB is down'));

      await expect(service.issue(7, 900)).rejects.toThrow('DB is down');

      expect(paymentService.save).not.toHaveBeenCalled();
      expect(mailService.sendRefundConfirmation).not.toHaveBeenCalled();
    });

    it('cancels the subscription and turns autoRenew off on success', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription({ state: SubscriptionState.ACTIVE, autoRenew: true }),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      await service.issue(7, 900);

      expect(subscriptionService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: SubscriptionState.CANCELLED,
          autoRenew: false,
        }),
      );
    });

    it('saves the subscription cancellation before marking the payment REFUNDED', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      await service.issue(7, 900);

      expect(subscriptionService.save).toHaveBeenCalled();
      expect(paymentService.save).toHaveBeenCalled();
      const subscriptionSaveOrder =
        subscriptionService.save.mock.invocationCallOrder[0];
      const paymentSaveOrder = paymentService.save.mock.invocationCallOrder[0];
      expect(subscriptionSaveOrder).toBeLessThan(paymentSaveOrder);
    });

    it('refuses to refund a payment that was already refunded', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ refundedAt: new Date('2026-03-01') }),
      );

      await expect(service.issue(7, 900)).rejects.toThrow(ConflictException);
      expect(mercadoPagoClient.refundPayment).not.toHaveBeenCalled();
      expect(paymentService.save).not.toHaveBeenCalled();
    });

    it('emails the member a refund confirmation', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(buildPayment());

      await service.issue(7, 900);

      expect(mailService.sendRefundConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'member@example.com',
          name: 'Ana',
          refundedAmount: 70000,
          monthsCharged: 3,
        }),
      );
    });

    it('skips the MP call when the computed amount is zero, but still cancels', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription({ startDate: '2025-05-01' }),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(
        buildPayment({ mpPaymentId: 'mp-pay-1' }),
      );

      await service.issue(7, 900);

      expect(mercadoPagoClient.refundPayment).not.toHaveBeenCalled();
      expect(paymentService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          state: PaymentState.REFUNDED,
          refundedAmount: 0,
        }),
      );
      expect(subscriptionService.save).toHaveBeenCalledWith(
        expect.objectContaining({ state: SubscriptionState.CANCELLED }),
      );
    });

    it('404s when the subscription does not exist', async () => {
      subscriptionService.findSubscription.mockResolvedValue(null);

      await expect(service.issue(999, 900)).rejects.toThrow(NotFoundException);
    });

    it('404s when there is no current-term payment to refund', async () => {
      subscriptionService.findSubscription.mockResolvedValue(
        buildSubscription(),
      );
      paymentService.findCurrentTermPayment.mockResolvedValue(null);

      await expect(service.issue(7, 900)).rejects.toThrow(NotFoundException);
    });
  });
});
