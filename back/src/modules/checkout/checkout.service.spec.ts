import { Test } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PlanService } from '../plan/plan.service';
import { PlanDurationService } from '../plan/plan-duration.service';
import { ChargeOrderService } from '../chargeOrder/chargeOrder.service';
import { MercadoPagoClient } from '../mercadopago/mercadopago.client';
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
  };
  let mercadoPago: {
    chargeCardToken: jest.Mock;
    chargeSavedCard: jest.Mock;
    findOrCreateCustomer: jest.Mock;
  };
  let payments: { confirmPlanCharge: jest.Mock };
  let savedCards: { findActiveForUser: jest.Mock; saveForUser: jest.Mock };
  let subscriptions: { setAutoRenew: jest.Mock };
  let mail: { sendPaymentReceipt: jest.Mock };

  const plan = { id: 12, name: 'Plan Full', price: 19995, numDays: 30, deleted: false };

  const dto = {
    planId: 12,
    months: 1,
    cardToken: 'tok_abc',
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
    };
    mercadoPago = {
      chargeCardToken: jest
        .fn()
        .mockResolvedValue({ id: '555', status: 'approved' }),
      chargeSavedCard: jest.fn(),
      findOrCreateCustomer: jest.fn().mockResolvedValue({ id: 'cus_1' }),
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
    savedCards = { findActiveForUser: jest.fn(), saveForUser: jest.fn() };
    subscriptions = { setAutoRenew: jest.fn() };
    mail = { sendPaymentReceipt: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PlanService, useValue: plans },
        { provide: PlanDurationService, useValue: planDurations },
        { provide: ChargeOrderService, useValue: chargeOrders },
        { provide: MercadoPagoClient, useValue: mercadoPago },
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
});
