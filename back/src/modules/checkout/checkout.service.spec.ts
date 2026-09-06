import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { ChargeOrderService } from '../chargeOrder/chargeOrder.service';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
} from '../mercadopago/mercadopago.client';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';
import { PaymentService } from '../payment/payment.service';
import { SavedCardService } from '../savedCard/savedCard.service';
import { subscriptionService } from '../subscription/subscription.service';
import { MailService } from '../../common/mail/mail.service';

describe('CheckoutService.pay', () => {
  let service: CheckoutService;
  let plans: { findPlan: jest.Mock };
  let planDurations: { findByPlan: jest.Mock };
  let chargeOrders: {
    createCharge: jest.Mock;
    closeAsPaid: jest.Mock;
    closeAsError: jest.Mock;
    findByExternalReference: jest.Mock;
  };
  let mercadoPago: {
    chargeCardToken: jest.Mock;
    chargeSavedCard: jest.Mock;
    findOrCreateCustomer: jest.Mock;
    createPreference: jest.Mock;
  };
  let payments: { confirmPlanCharge: jest.Mock };
  let savedCards: {
    findActiveForUser: jest.Mock;
    saveForUser: jest.Mock;
    saveFromApprovedPayment: jest.Mock;
  };
  let subscriptions: { setAutoRenew: jest.Mock; findChangeContext: jest.Mock };
  let mail: { sendPaymentReceipt: jest.Mock };

  const plan = {
    id: 12,
    name: 'Plan Full',
    price: 19995,
    numDays: 30,
    deleted: false,
  };

  // What Mercado Pago echoes back on the approved payment — the only source
  // of card data the checkout has, its token having been spent by the charge.
  const approvedCard = {
    id: 'card_9',
    lastFourDigits: '4242',
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    expirationMonth: 12,
    expirationYear: 2030,
  };

  const dto = {
    planId: 12,
    months: 1,
    cardToken: 'tok_abc',
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    saveCard: false,
    acceptedTerms: true as const,
  };

  beforeEach(async () => {
    plans = { findPlan: jest.fn().mockResolvedValue(plan) };
    planDurations = { findByPlan: jest.fn().mockResolvedValue([]) };
    chargeOrders = {
      createCharge: jest
        .fn()
        .mockResolvedValue({ id: 7, externalReference: 'flg-user-3-abcd1234' }),
      closeAsPaid: jest.fn().mockResolvedValue(undefined),
      closeAsError: jest.fn().mockResolvedValue(undefined),
      findByExternalReference: jest.fn(),
    };
    mercadoPago = {
      chargeCardToken: jest.fn().mockResolvedValue({
        id: '555',
        status: 'approved',
        card: approvedCard,
      }),
      chargeSavedCard: jest.fn(),
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cus_1' }),
      createPreference: jest.fn(),
    };
    payments = {
      confirmPlanCharge: jest.fn().mockResolvedValue({
        payment: { id: 90 },
        subscription: {
          id: 44,
          endDate: '2026-10-02',
          user: { email: 'rosa@gmail.com', name: 'Rosa' },
          plan: { name: 'Plan Full' },
        },
      }),
    };
    savedCards = {
      findActiveForUser: jest.fn(),
      saveForUser: jest.fn(),
      saveFromApprovedPayment: jest.fn().mockResolvedValue({ id: 5 }),
    };
    subscriptions = {
      setAutoRenew: jest.fn(),
      findChangeContext: jest.fn(),
    };
    mail = { sendPaymentReceipt: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PlanService, useValue: plans },
        { provide: PlanDurationService, useValue: planDurations },
        { provide: ChargeOrderService, useValue: chargeOrders },
        { provide: MercadoPagoClient, useValue: mercadoPago },
        {
          provide: MercadoPagoConfig,
          useValue: { frontendUrl: 'https://flg.example.com' },
        },
        { provide: PaymentService, useValue: payments },
        { provide: SavedCardService, useValue: savedCards },
        { provide: subscriptionService, useValue: subscriptions },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = moduleRef.get(CheckoutService);
  });

  it('charges the price it resolved, not anything the client sent', async () => {
    await service.pay(3, 'rosa@gmail.com', dto);

    expect(mercadoPago.chargeCardToken).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 19995, token: 'tok_abc' }),
    );
  });

  it('records the payment, closes the order, then emails the receipt', async () => {
    const result = await service.pay(3, 'rosa@gmail.com', dto);

    expect(payments.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        mpPaymentId: '555',
        userId: 3,
        planId: 12,
        months: 1,
        amount: 19995,
        payMethod: 'mercadopago',
        registeredById: null,
      }),
    );
    expect(chargeOrders.closeAsPaid).toHaveBeenCalledWith(
      'flg-user-3-abcd1234',
      90,
      44,
    );
    expect(mail.sendPaymentReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'rosa@gmail.com', amount: 19995 }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        status: 'approved',
        paymentId: 90,
        newEndDate: '2026-10-02',
      }),
    );
  });

  it('arms an online charge order with no collection point', async () => {
    await service.pay(3, 'rosa@gmail.com', dto);

    expect(chargeOrders.createCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'online',
        collectionPointId: null,
        adminId: null,
        amount: 19995,
      }),
    );
  });

  it('derives the idempotency key from the single-use token', async () => {
    await service.pay(3, 'rosa@gmail.com', dto);

    expect(mercadoPago.chargeCardToken).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'checkout-tok_abc' }),
    );
  });

  it('returns a decline without recording a payment', async () => {
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '556',
      status: 'rejected',
      statusDetail: 'cc_rejected_insufficient_amount',
    });

    const result = await service.pay(3, 'rosa@gmail.com', dto);

    expect(result).toEqual({
      status: 'rejected',
      statusDetail: 'cc_rejected_insufficient_amount',
    });
    expect(payments.confirmPlanCharge).not.toHaveBeenCalled();
    expect(chargeOrders.closeAsError).toHaveBeenCalledWith(
      'flg-user-3-abcd1234',
      'cc_rejected_insufficient_amount',
    );
  });

  it('reports in_process without activating the subscription', async () => {
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '557',
      status: 'in_process',
      statusDetail: 'pending_review_manual',
    });

    const result = await service.pay(3, 'rosa@gmail.com', dto);

    expect(result.status).toBe('in_process');
    expect(payments.confirmPlanCharge).not.toHaveBeenCalled();
  });

  it('leaves an in_process order pending so the webhook can finish it', async () => {
    // Closing it as an error would make ChargeOrderResolverAdapter.resolve
    // return null when Mercado Pago approves the payment later — the member
    // charged, with neither a Payment nor a promoted Subscription recorded.
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '557',
      status: 'in_process',
      statusDetail: 'pending_review_manual',
    });

    const result = await service.pay(3, 'rosa@gmail.com', dto);

    expect(result).toEqual({
      status: 'in_process',
      statusDetail: 'pending_review_manual',
    });
    expect(chargeOrders.closeAsError).not.toHaveBeenCalled();
    expect(chargeOrders.closeAsPaid).not.toHaveBeenCalled();
  });

  it('closes the order as an error when Mercado Pago is unreachable', async () => {
    mercadoPago.chargeCardToken.mockRejectedValue(
      new MercadoPagoUnavailableError('network down'),
    );

    await expect(service.pay(3, 'rosa@gmail.com', dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(chargeOrders.closeAsError).toHaveBeenCalled();
    expect(payments.confirmPlanCharge).not.toHaveBeenCalled();
  });

  it('charges the saved card without a token', async () => {
    savedCards.findActiveForUser.mockResolvedValue({
      mpCustomerId: 'cus_1',
      mpCardId: 'card_1',
      active: true,
      deleted: false,
      expirationMonth: 12,
      expirationYear: 2099,
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
    });
    mercadoPago.chargeSavedCard.mockResolvedValue({
      id: '558',
      status: 'approved',
    });

    await service.pay(3, 'rosa@gmail.com', {
      planId: 12,
      months: 1,
      useSavedCard: true,
      acceptedTerms: true,
    });

    expect(mercadoPago.chargeSavedCard).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'cus_1',
        cardId: 'card_1',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
        // Without this, an order created for a saved-card charge carries no
        // external_reference, so a lost synchronous response can never be
        // recovered by the webhook.
        externalReference: 'flg-user-3-abcd1234',
      }),
    );
    expect(mercadoPago.chargeCardToken).not.toHaveBeenCalled();
  });

  it('refuses to use a saved card the member does not have', async () => {
    savedCards.findActiveForUser.mockResolvedValue(null);

    await expect(
      service.pay(3, 'rosa@gmail.com', {
        planId: 12,
        months: 1,
        useSavedCard: true,
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('closes the order when the member has no usable saved card', async () => {
    savedCards.findActiveForUser.mockResolvedValue(null);

    await expect(
      service.pay(3, 'rosa@gmail.com', {
        planId: 12,
        months: 1,
        useSavedCard: true,
        acceptedTerms: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(chargeOrders.closeAsError).toHaveBeenCalledWith(
      'flg-user-3-abcd1234',
      'No tenés una tarjeta guardada que se pueda usar. Ingresá una nueva.',
    );
  });

  it('saves the card and enables auto-renew when asked', async () => {
    await service.pay(3, 'rosa@gmail.com', { ...dto, saveCard: true });

    expect(mercadoPago.findOrCreateCustomer).toHaveBeenCalledWith(
      'rosa@gmail.com',
    );
    // From the approved payment's own response, against the customer the
    // charge was scoped to — never a second Mercado Pago call with the
    // already-spent token, which is what saveForUser would have done.
    expect(savedCards.saveFromApprovedPayment).toHaveBeenCalledWith(
      3,
      'cus_1',
      approvedCard,
    );
    expect(savedCards.saveForUser).not.toHaveBeenCalled();
    expect(subscriptions.setAutoRenew).toHaveBeenCalledWith(44, true);
  });

  it('still completes the sale when saving the card fails', async () => {
    savedCards.saveFromApprovedPayment.mockRejectedValue(new Error('db down'));

    const result = await service.pay(3, 'rosa@gmail.com', {
      ...dto,
      saveCard: true,
    });

    expect(result.status).toBe('approved');
  });

  it('skips saving when the approved payment carries no card', async () => {
    // Nothing to persist and nothing to charge later, so auto-renew stays
    // off rather than promising a renewal with no card behind it.
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '555',
      status: 'approved',
    });

    const result = await service.pay(3, 'rosa@gmail.com', {
      ...dto,
      saveCard: true,
    });

    expect(result.status).toBe('approved');
    expect(savedCards.saveFromApprovedPayment).not.toHaveBeenCalled();
    expect(subscriptions.setAutoRenew).not.toHaveBeenCalled();
  });

  it('leaves the order pending when the post-approval write fails', async () => {
    payments.confirmPlanCharge.mockRejectedValue(new Error('deadlock'));

    await expect(service.pay(3, 'rosa@gmail.com', dto)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // Closing it would make ChargeOrderResolverAdapter return null and break
    // the webhook recovery this row exists for.
    expect(chargeOrders.closeAsError).not.toHaveBeenCalled();
    expect(chargeOrders.closeAsPaid).not.toHaveBeenCalled();
  });

  it('forwards the payment method id and type to chargeCardToken', async () => {
    await service.pay(3, 'rosa@gmail.com', {
      ...dto,
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
    });

    expect(mercadoPago.chargeCardToken).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      }),
    );
  });

  it('persists mpOrderId on the payment when the charge carries one', async () => {
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '555',
      status: 'approved',
      mpOrderId: 'ORD01',
      card: approvedCard,
    });

    await service.pay(3, 'rosa@gmail.com', dto);

    expect(payments.confirmPlanCharge).toHaveBeenCalledWith(
      expect.objectContaining({ mpOrderId: 'ORD01' }),
    );
  });

  it("persists the card's paymentTypeId when saving from an approved payment", async () => {
    mercadoPago.chargeCardToken.mockResolvedValue({
      id: '555',
      status: 'approved',
      card: { ...approvedCard, paymentTypeId: 'credit_card' },
    });

    await service.pay(3, 'rosa@gmail.com', { ...dto, saveCard: true });

    expect(savedCards.saveFromApprovedPayment).toHaveBeenCalledWith(
      3,
      'cus_1',
      expect.objectContaining({ paymentTypeId: 'credit_card' }),
    );
  });

  describe('CheckoutService.createPreference', () => {
    it('prices from the plan and never writes a charge order', async () => {
      mercadoPago.createPreference.mockResolvedValue({ id: 'pref-123' });

      const result = await service.createPreference(7, 'socio@example.com', {
        planId: 12,
        months: 1,
      });

      expect(result.preferenceId).toBe('pref-123');
      expect(result.amount).toBe(19995);
      expect(result.externalReference).toMatch(/^flg-user-7-[a-f0-9]{8}$/);
      expect(chargeOrders.createCharge).not.toHaveBeenCalled();
    });

    it('passes the server-resolved amount and the member email to Mercado Pago', async () => {
      mercadoPago.createPreference.mockResolvedValue({ id: 'pref-123' });

      await service.createPreference(7, 'socio@example.com', {
        planId: 12,
        months: 1,
      });

      expect(mercadoPago.createPreference).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 19995,
          payerEmail: 'socio@example.com',
          planName: 'Plan Full',
          frontendUrl: 'https://flg.example.com',
        }),
      );
    });

    it('surfaces an outage as ServiceUnavailableException', async () => {
      mercadoPago.createPreference.mockRejectedValue(
        new MercadoPagoUnavailableError('down'),
      );

      await expect(
        service.createPreference(7, 'socio@example.com', {
          planId: 12,
          months: 1,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('CheckoutService.armOrder', () => {
    const dto = {
      planId: 12,
      months: 1,
      externalReference: 'flg-user-7-a1b2c3d4',
    };

    it('creates an online order carrying the supplied reference', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue(null);

      await service.armOrder(7, dto);

      expect(chargeOrders.createCharge).toHaveBeenCalledWith({
        userId: 7,
        planId: 12,
        months: 1,
        amount: 19995,
        method: 'online',
        collectionPointId: null,
        adminId: null,
        externalReference: 'flg-user-7-a1b2c3d4',
      });
    });

    it('re-prices server-side rather than trusting anything sent', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue(null);

      await service.armOrder(7, { ...dto, amount: 1 } as never);

      expect(chargeOrders.createCharge).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 19995 }),
      );
    });

    it('is a no-op when this member already armed that reference', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 7,
        status: 'pendiente',
        externalReference: dto.externalReference,
      });

      await service.armOrder(7, dto);

      expect(chargeOrders.createCharge).not.toHaveBeenCalled();
    });

    it('refuses a reference belonging to another member', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 99,
        status: 'pendiente',
        externalReference: dto.externalReference,
      });

      await expect(service.armOrder(7, dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(chargeOrders.createCharge).not.toHaveBeenCalled();
    });

    it('refuses to re-arm a reference that already settled', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 7,
        status: 'pagada',
        externalReference: dto.externalReference,
      });

      await expect(service.armOrder(7, dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('arms a plan-change order at the prorated amount instead of throwing on an undefined term', async () => {
      // Regression test: createPreference/pay/armOrder used to call
      // getSummary(dto.planId, dto.months) unconditionally, and armOrder
      // forwarded dto.months straight into createCharge. dto.months is
      // undefined by design in plan-change mode (@ValidateIf on the DTOs),
      // so both would throw "no tiene un precio para undefined meses" before
      // ever reaching resolveCharge's plan-change branch below.
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      chargeOrders.findByExternalReference.mockResolvedValue(null);
      subscriptions.findChangeContext.mockResolvedValue({
        subscription: { id: 10, endDate: '2026-03-31' },
        current: {
          plan: { id: 1, price: 6000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      plans.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      await service.armOrder(7, {
        planId: 2,
        mode: 'plan-change',
        externalReference: 'flg-user-7-a1b2c3d4',
      } as never);

      expect(chargeOrders.createCharge).toHaveBeenCalledWith({
        userId: 7,
        planId: 2,
        // 0, not undefined: charge.termMonths, resolveCharge's own resolved
        // value for a plan change.
        months: 0,
        amount: 6000,
        method: 'online',
        collectionPointId: null,
        adminId: null,
        externalReference: 'flg-user-7-a1b2c3d4',
      });
      jest.useRealTimers();
    });
  });

  describe('resolveCharge', () => {
    it('resolves the same amount for the three entry points', async () => {
      // The Payment Brick shows what createPreference returns and the member is
      // charged what pay() resolves. If these ever diverge, a member sees one
      // price and is billed another.
      plans.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        name: 'Basic',
      });
      planDurations.findByPlan.mockResolvedValue([]);

      const dto = { planId: 1, months: 1 };
      const resolved = await service.resolveCharge(7, dto);

      expect(resolved).toEqual({
        amount: 6000,
        planDurationId: null,
        termMonths: 1,
        changeFromSubscriptionId: null,
        endDateOverride: null,
      });
    });
  });

  describe('getPlanChangeQuote', () => {
    const activeBasic = {
      subscription: { id: 10, endDate: '2026-03-31' },
      current: {
        plan: { id: 1, price: 6000, numDays: 30 },
        state: 'activa',
        termStartDate: '2026-01-01',
        endDate: '2026-03-31',
        alreadyChanged: false,
      },
    };

    it('quotes an upgrade as the difference, keeping the end date', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      subscriptions.findChangeContext.mockResolvedValue(activeBasic);
      plans.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      // 30 days elapsed of a 90-day term (Jan 1 - Mar 31) leaves 60 days
      // remaining, not 61 — the brief's own fixture asserted 61/6100, which
      // is off by one day against the merged Task 2 daysRemaining/assessChange.
      expect(await service.getPlanChangeQuote(7, 2)).toEqual({
        planId: 2,
        planName: 'Premium',
        eligible: true,
        reason: null,
        message: null,
        direction: 'upgrade',
        amount: 6000,
        daysRemaining: 60,
        effectiveEndDate: '2026-03-31',
      });
      jest.useRealTimers();
    });

    it('quotes a downgrade at zero, effective at the end of the term', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      subscriptions.findChangeContext.mockResolvedValue({
        ...activeBasic,
        current: {
          ...activeBasic.current,
          plan: { id: 2, price: 9000, numDays: 30 },
        },
      });
      plans.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        name: 'Basic',
      });

      expect(await service.getPlanChangeQuote(7, 1)).toMatchObject({
        eligible: true,
        direction: 'downgrade',
        amount: 0,
        effectiveEndDate: '2026-03-31',
      });
      jest.useRealTimers();
    });

    it('carries the Spanish reason when the change is refused', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 10));
      subscriptions.findChangeContext.mockResolvedValue(activeBasic);
      plans.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      const quote = await service.getPlanChangeQuote(7, 2);

      expect(quote.eligible).toBe(false);
      expect(quote.reason).toBe('locked');
      expect(quote.message).toBe(
        'Podés cambiar de plan a partir del 31/01/2026.',
      );
      jest.useRealTimers();
    });
  });

  describe('resolveCharge in plan-change mode', () => {
    it('returns the prorated amount, termMonths 0 and the inherited end date', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      subscriptions.findChangeContext.mockResolvedValue({
        subscription: { id: 10, endDate: '2026-03-31' },
        current: {
          plan: { id: 1, price: 6000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      plans.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      // See the note in getPlanChangeQuote above: 6000/60, not the brief's
      // original 6100/61.
      expect(
        await service.resolveCharge(7, { planId: 2, mode: 'plan-change' }),
      ).toEqual({
        amount: 6000,
        planDurationId: null,
        termMonths: 0,
        changeFromSubscriptionId: 10,
        endDateOverride: '2026-03-31',
      });
      jest.useRealTimers();
    });

    it('refuses to charge for a change that is not eligible', async () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      subscriptions.findChangeContext.mockResolvedValue(null);
      plans.findPlan.mockResolvedValue({
        id: 2,
        price: 9000,
        numDays: 30,
        name: 'Premium',
      });

      await expect(
        service.resolveCharge(7, { planId: 2, mode: 'plan-change' }),
      ).rejects.toThrow('No tenés un plan activo para cambiar.');
      jest.useRealTimers();
    });

    it('refuses to charge for a downgrade, which never costs money', async () => {
      // A zero-peso charge cannot go through Mercado Pago. Reaching checkout
      // at all for a downgrade is a frontend bug, and this is where it
      // surfaces.
      jest.useFakeTimers().setSystemTime(new Date(2026, 0, 31));
      subscriptions.findChangeContext.mockResolvedValue({
        subscription: { id: 10, endDate: '2026-03-31' },
        current: {
          plan: { id: 2, price: 9000, numDays: 30 },
          state: 'activa',
          termStartDate: '2026-01-01',
          endDate: '2026-03-31',
          alreadyChanged: false,
        },
      });
      plans.findPlan.mockResolvedValue({
        id: 1,
        price: 6000,
        numDays: 30,
        name: 'Basic',
      });

      await expect(
        service.resolveCharge(7, { planId: 1, mode: 'plan-change' }),
      ).rejects.toThrow(ConflictException);
      jest.useRealTimers();
    });
  });

  describe('CheckoutService.getStatus', () => {
    const reference = 'flg-user-7-a1b2c3d4';

    it('reports a live order as pending', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 7,
        status: 'pendiente',
        amount: 19995,
        termMonths: 1,
        planId: 12,
      });

      expect(await service.getStatus(7, reference)).toEqual({
        status: 'pending',
      });
    });

    it('reports a closed order as approved, with what the receipt shows', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 7,
        status: 'pagada',
        amount: 19995,
        termMonths: 1,
        planId: 12,
        paymentId: 55,
        subscription: {
          endDate: '2027-03-04',
          plan: { name: 'Plan Full' },
        },
      });

      expect(await service.getStatus(7, reference)).toEqual({
        status: 'approved',
        paymentId: 55,
        newEndDate: '2027-03-04',
        planName: 'Plan Full',
        amount: 19995,
        months: 1,
      });
    });

    it('reports an errored order as rejected', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 7,
        status: 'error',
        amount: 19995,
        termMonths: 1,
        planId: 12,
      });

      expect(await service.getStatus(7, reference)).toEqual({
        status: 'rejected',
      });
    });

    it('404s on another member’s reference rather than confirming it exists', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue({
        userId: 99,
        status: 'pagada',
      });

      await expect(service.getStatus(7, reference)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404s on an unknown reference', async () => {
      chargeOrders.findByExternalReference.mockResolvedValue(null);

      await expect(service.getStatus(7, reference)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
