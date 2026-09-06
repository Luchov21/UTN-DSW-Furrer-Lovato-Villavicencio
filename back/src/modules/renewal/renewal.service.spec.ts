import { RenewalService } from './renewal.service';
import { MercadoPagoUnavailableError } from '../mercadopago/mercadopago.client';
import {
  renewalDueDates,
  toDateOnly,
} from '../subscription/subscription.rules';
import { PaymentState } from '../payment/enum/payment-state.enum';

describe('RenewalService.chargeDueSubscriptions', () => {
  let config: { enabled: boolean };
  let subscriptionService: { findDueForRenewal: jest.Mock };
  let savedCardService: { findActiveForUser: jest.Mock };
  let mercadoPagoClient: { chargeSavedCard: jest.Mock };
  let paymentService: {
    createFromMercadoPago: jest.Mock;
    createFailedPayment: jest.Mock;
  };
  let mailService: {
    sendPaymentReceipt: jest.Mock;
    sendRenewalFailure: jest.Mock;
  };
  let service: RenewalService;

  // Computed the same way the service computes it, so these tests stay valid
  // no matter what day they run on. renewalDueDates is furthest-first, so
  // index 0 is the FIRST attempt chronologically (3 days out) and the last
  // index is the FINAL attempt (1 day out, the night before it lapses).
  const dueDates = renewalDueDates(toDateOnly(new Date()));
  const [firstDueDate, middleDueDate, finalDueDate] = dueDates;

  const chargeableCard = {
    id: 1,
    userId: 42,
    mpCustomerId: 'cust-1',
    mpCardId: 'card-1',
    active: true,
    deleted: false,
    expirationMonth: 12,
    expirationYear: 2099,
    paymentMethodId: 'master',
    paymentTypeId: 'credit_card',
  };

  const buildSubscription = (overrides: Record<string, unknown> = {}) => ({
    id: 100,
    userId: 42,
    endDate: firstDueDate,
    plan: { id: 1, name: 'Mensual', price: 15000, numDays: 30 },
    user: { id: 42, email: 'member@example.com', name: 'Ana' },
    ...overrides,
  });

  const buildService = () => {
    service = new RenewalService(
      config as never,
      subscriptionService as never,
      savedCardService as never,
      mercadoPagoClient as never,
      paymentService as never,
      mailService as never,
    );
  };

  beforeEach(() => {
    config = { enabled: true };
    subscriptionService = {
      findDueForRenewal: jest.fn().mockResolvedValue([]),
    };
    savedCardService = {
      findActiveForUser: jest.fn().mockResolvedValue(chargeableCard),
    };
    mercadoPagoClient = {
      chargeSavedCard: jest.fn().mockResolvedValue({
        id: 'mp-pay-1',
        status: 'approved',
        transactionAmount: 15000,
      }),
    };
    paymentService = {
      createFromMercadoPago: jest.fn().mockResolvedValue({ id: 1 }),
      createFailedPayment: jest
        .fn()
        .mockResolvedValue({ id: 2, state: PaymentState.FAILED }),
    };
    mailService = {
      sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
      sendRenewalFailure: jest.fn().mockResolvedValue(undefined),
    };
  });

  // A developer without credentials must not see the cron throw nightly.
  it('does nothing at all when MP_ENABLED is false', async () => {
    config.enabled = false;
    buildService();

    await service.chargeDueSubscriptions();

    expect(subscriptionService.findDueForRenewal).not.toHaveBeenCalled();
    expect(savedCardService.findActiveForUser).not.toHaveBeenCalled();
    expect(mercadoPagoClient.chargeSavedCard).not.toHaveBeenCalled();
  });

  // Auto-renewal always renews by ONE month, never the member's original
  // multi-month term — nobody is silently charged for another year.
  it('charges a due subscription and extends it by one month', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cust-1',
        cardId: 'card-1',
        amount: 15000,
      }),
    );
    expect(paymentService.createFromMercadoPago).toHaveBeenCalledWith(
      expect.objectContaining({
        mpPaymentId: 'mp-pay-1',
        subscriptionId: 100,
        amount: 15000,
        termMonths: 1,
        payMethod: 'mercadopago',
      }),
    );
  });

  it("passes the saved card's method and type to chargeSavedCard", async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    savedCardService.findActiveForUser.mockResolvedValue({
      mpCustomerId: 'cus_1',
      mpCardId: 'card_1',
      active: true,
      deleted: false,
      expirationMonth: 12,
      expirationYear: 2099,
      paymentMethodId: 'master',
      paymentTypeId: 'credit_card',
    });
    mercadoPagoClient.chargeSavedCard.mockResolvedValue({
      id: 'mp-1',
      status: 'approved',
    });
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodId: 'master',
        paymentTypeId: 'credit_card',
      }),
    );
  });

  it('persists mpOrderId when the renewal charge carries one', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    savedCardService.findActiveForUser.mockResolvedValue({
      mpCustomerId: 'cus_1',
      mpCardId: 'card_1',
      active: true,
      deleted: false,
      expirationMonth: 12,
      expirationYear: 2099,
      paymentMethodId: 'master',
      paymentTypeId: 'credit_card',
    });
    mercadoPagoClient.chargeSavedCard.mockResolvedValue({
      id: 'mp-1',
      status: 'approved',
      mpOrderId: 'ORD20',
    });
    buildService();

    await service.chargeDueSubscriptions();

    expect(paymentService.createFromMercadoPago).toHaveBeenCalledWith(
      expect.objectContaining({ mpOrderId: 'ORD20' }),
    );
  });

  // A restarted cron replays the same key, so MP returns the original
  // payment instead of charging twice.
  it('passes an idempotency key derived from the subscription and endDate', async () => {
    const sub = buildSubscription({ id: 55, endDate: '2026-09-10' });
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'renewal-55-2026-09-10' }),
    );
  });

  it('never selects a PAUSED subscription', async () => {
    // Selection is entirely delegated to findDueForRenewal, which already
    // filters state: ACTIVE, autoRenew: true — this asserts the cron does
    // not run any separate query of its own that could bypass that filter.
    buildService();

    await service.chargeDueSubscriptions();

    expect(subscriptionService.findDueForRenewal).toHaveBeenCalledWith(
      dueDates,
    );
  });

  it('records a FAILED payment and emails on a decline, leaving endDate alone', async () => {
    const sub = buildSubscription({ endDate: firstDueDate });
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    mercadoPagoClient.chargeSavedCard.mockResolvedValue({
      id: 'mp-pay-2',
      status: 'rejected',
    });
    buildService();

    await service.chargeDueSubscriptions();

    expect(paymentService.createFailedPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: 100,
        amount: 15000,
        payMethod: 'mercadopago',
        termMonths: 1,
        monthlyPriceAtPurchase: 15000,
      }),
    );
    // No promotion/extension branch is ever reached on a decline.
    expect(paymentService.createFromMercadoPago).not.toHaveBeenCalled();
    expect(mailService.sendRenewalFailure).toHaveBeenCalled();
  });

  it('emails on the first and last attempt but not the middle one', async () => {
    const first = buildSubscription({ id: 1, endDate: firstDueDate });
    const middle = buildSubscription({ id: 2, endDate: middleDueDate });
    const final = buildSubscription({ id: 3, endDate: finalDueDate });
    subscriptionService.findDueForRenewal.mockResolvedValue([
      first,
      middle,
      final,
    ]);
    mercadoPagoClient.chargeSavedCard.mockResolvedValue({
      id: 'mp-pay',
      status: 'rejected',
    });
    buildService();

    await service.chargeDueSubscriptions();

    expect(mailService.sendRenewalFailure).toHaveBeenCalledTimes(2);
    expect(mailService.sendRenewalFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        endDate: firstDueDate,
        isFinalAttempt: false,
      }),
    );
    expect(mailService.sendRenewalFailure).toHaveBeenCalledWith(
      expect.objectContaining({ endDate: finalDueDate, isFinalAttempt: true }),
    );
    expect(mailService.sendRenewalFailure).not.toHaveBeenCalledWith(
      expect.objectContaining({ endDate: middleDueDate }),
    );
  });

  // MercadoPagoUnavailableError is an outage, not a decline. Consuming a
  // retry and telling the member their card failed would both be wrong.
  it('does not email or record anything when Mercado Pago is unreachable', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    mercadoPagoClient.chargeSavedCard.mockRejectedValue(
      new MercadoPagoUnavailableError('Mercado Pago is down'),
    );
    buildService();

    await service.chargeDueSubscriptions();

    expect(paymentService.createFromMercadoPago).not.toHaveBeenCalled();
    expect(paymentService.createFailedPayment).not.toHaveBeenCalled();
    expect(mailService.sendPaymentReceipt).not.toHaveBeenCalled();
    expect(mailService.sendRenewalFailure).not.toHaveBeenCalled();
  });

  // Three due subscriptions, the second throws: the first and third must
  // still be charged. Without per-member isolation one bad row silently
  // leaves every later membership uncharged.
  it('keeps going when one member throws', async () => {
    const subs = [
      buildSubscription({ id: 1 }),
      buildSubscription({ id: 2 }),
      buildSubscription({ id: 3 }),
    ];
    subscriptionService.findDueForRenewal.mockResolvedValue(subs);
    savedCardService.findActiveForUser
      .mockResolvedValueOnce(chargeableCard)
      .mockRejectedValueOnce(new Error('unexpected boom'))
      .mockResolvedValueOnce(chargeableCard);
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).toHaveBeenCalledTimes(2);
    expect(paymentService.createFromMercadoPago).toHaveBeenCalledTimes(2);
  });

  it('skips a member whose card is gone', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    savedCardService.findActiveForUser.mockResolvedValue(null);
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).not.toHaveBeenCalled();
    expect(paymentService.createFromMercadoPago).not.toHaveBeenCalled();
    expect(paymentService.createFailedPayment).not.toHaveBeenCalled();
  });

  it('skips a member whose card is expired, same as one with no card', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    savedCardService.findActiveForUser.mockResolvedValue({
      ...chargeableCard,
      expirationMonth: 1,
      expirationYear: 2020,
    });
    buildService();

    await service.chargeDueSubscriptions();

    expect(mercadoPagoClient.chargeSavedCard).not.toHaveBeenCalled();
    expect(paymentService.createFailedPayment).not.toHaveBeenCalled();
  });

  it('sends a receipt on success', async () => {
    const sub = buildSubscription();
    subscriptionService.findDueForRenewal.mockResolvedValue([sub]);
    buildService();

    await service.chargeDueSubscriptions();

    expect(mailService.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'member@example.com',
        name: 'Ana',
        planName: 'Mensual',
        amount: 15000,
        termMonths: 1,
        method: 'mercadopago',
      }),
    );
  });
});
