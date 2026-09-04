import { MercadoPagoConfig } from './mercadopago.config';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
  mapOrderStatusToPaymentStatus,
} from './mercadopago.client';

// The SDK's client classes (Payment, Customer, ...) are constructed fresh
// per call — `new Payment(sdkConfig)` inside each MercadoPagoClient method —
// rather than injected, so the whole `mercadopago` module is mocked here.
// Each class's methods are backed by a jest.fn() the tests assert against;
// only `create` is stubbed for now since it's all `chargeCardToken` uses.
interface PaymentCreateArgs {
  body: Record<string, unknown>;
  requestOptions: { idempotencyKey: string };
}

interface PaymentLike {
  id: number;
  status?: string;
  status_detail?: string;
  transaction_amount?: number;
  external_reference?: string;
  payment_method_id?: string;
  card?: {
    id?: string;
    last_four_digits?: string;
    expiration_month?: number;
    expiration_year?: number;
  };
}

const paymentCreate = jest.fn<Promise<PaymentLike>, [PaymentCreateArgs]>();

interface OrderCreateArgs {
  body: Record<string, unknown>;
  requestOptions: { idempotencyKey: string };
}

interface OrderLike {
  id?: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  total_paid_amount?: number;
  transactions?: {
    payments?: Array<{
      id?: string;
      payment_method?: { id?: string; type?: string; card_id?: string };
    }>;
  };
}

const orderCreate = jest.fn<Promise<OrderLike>, [OrderCreateArgs]>();

jest.mock('mercadopago', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
  Payment: jest.fn().mockImplementation(() => ({ create: paymentCreate })),
  Customer: jest.fn().mockImplementation(() => ({})),
  CardToken: jest.fn().mockImplementation(() => ({})),
  PaymentRefund: jest.fn().mockImplementation(() => ({})),
  Order: jest.fn().mockImplementation(() => ({
    create: orderCreate,
    get: jest.fn(),
    cancel: jest.fn(),
  })),
}));

const configOf = (env: Record<string, string | undefined>) =>
  new MercadoPagoConfig({ get: (k: string) => env[k] } as never);

const ENABLED_ENV = {
  MP_ENABLED: 'true',
  MP_ACCESS_TOKEN: 'fake-access-token-for-tests',
  MP_PUBLIC_KEY: 'fake-public-key-for-tests',
  MP_WEBHOOK_SECRET: 'secret',
};

describe('mapOrderStatusToPaymentStatus', () => {
  it('maps an approved order to approved', () => {
    expect(mapOrderStatusToPaymentStatus('processed')).toBe('approved');
  });

  it('maps a failed order to rejected', () => {
    expect(mapOrderStatusToPaymentStatus('failed')).toBe('rejected');
  });

  it('maps processing and action_required to in_process', () => {
    expect(mapOrderStatusToPaymentStatus('processing')).toBe('in_process');
    expect(mapOrderStatusToPaymentStatus('action_required')).toBe('in_process');
  });

  it('maps canceled to cancelled', () => {
    expect(mapOrderStatusToPaymentStatus('canceled')).toBe('cancelled');
  });

  it('passes refunded, charged_back, created and unknown values through as-is', () => {
    expect(mapOrderStatusToPaymentStatus('refunded')).toBe('refunded');
    expect(mapOrderStatusToPaymentStatus('charged_back')).toBe('charged_back');
    expect(mapOrderStatusToPaymentStatus('created')).toBe('created');
    expect(mapOrderStatusToPaymentStatus(undefined)).toBeUndefined();
  });
});

describe('MercadoPagoClient', () => {
  let client: MercadoPagoClient;

  beforeEach(() => {
    paymentCreate.mockReset();
    client = new MercadoPagoClient(configOf(ENABLED_ENV));
  });

  describe('MercadoPagoClient.chargeCardToken', () => {
    beforeEach(() => {
      orderCreate.mockReset();
    });

    it('sends an online order with the token, amount and payment method', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD01',
        status: 'processed',
        status_detail: 'accredited',
        external_reference: 'flg-user-3-abcd1234',
        total_paid_amount: 19995,
        transactions: { payments: [{ id: '123' }] },
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        description: 'Membresía FLG',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      expect(orderCreate).toHaveBeenCalledWith({
        body: expect.objectContaining({
          type: 'online',
          processing_mode: 'automatic',
          external_reference: 'flg-user-3-abcd1234',
          total_amount: '19995.00',
          transactions: {
            payments: [
              {
                amount: '19995.00',
                payment_method: {
                  id: 'visa',
                  type: 'credit_card',
                  token: 'tok_abc',
                  installments: 1,
                },
              },
            ],
          },
        }) as Record<string, unknown>,
        requestOptions: { idempotencyKey: 'checkout-tok_abc' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: '123',
          status: 'approved',
          mpOrderId: 'ORD01',
        }),
      );
    });

    it('scopes the payer to a customer when one is given', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD02',
        status: 'processed',
        transactions: { payments: [{ id: '124' }] },
      });

      await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        customerId: 'cus_1',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      const body = orderCreate.mock.calls[0][0].body as {
        payer: { customer_id: string };
      };
      expect(body.payer).toEqual({ customer_id: 'cus_1' });
    });

    it('falls back to a plain email payer with no customer', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD03',
        status: 'processed',
        transactions: { payments: [{ id: '125' }] },
      });

      await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        payerEmail: 'rosa@gmail.com',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      const body = orderCreate.mock.calls[0][0].body as {
        payer: { email: string };
      };
      expect(body.payer).toEqual({ email: 'rosa@gmail.com' });
    });

    it('wraps an SDK failure as MercadoPagoUnavailableError', async () => {
      orderCreate.mockRejectedValue(new Error('network down'));

      await expect(
        client.chargeCardToken({
          token: 'tok_abc',
          amount: 19995,
          externalReference: 'flg-user-3-abcd1234',
          idempotencyKey: 'checkout-tok_abc',
          paymentMethodId: 'visa',
          paymentTypeId: 'credit_card',
        }),
      ).rejects.toBeInstanceOf(MercadoPagoUnavailableError);
    });

    it('does not treat a rejected order as an error', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD04',
        status: 'failed',
        status_detail: 'cc_rejected_insufficient_amount',
        transactions: { payments: [{ id: '126' }] },
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      expect(result.status).toBe('rejected');
      expect(result.statusDetail).toBe('cc_rejected_insufficient_amount');
    });

    it('reports the card the payment was made with, when saving to a customer', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD05',
        status: 'processed',
        transactions: {
          payments: [
            {
              id: '127',
              payment_method: {
                id: 'visa',
                type: 'credit_card',
                card_id: 'card_9',
              },
            },
          ],
        },
      });
      // jest.spyOn rather than a raw `client.getCard = jest.fn()` reassignment
      // so the assertion below references a plain mock variable, not the
      // class method itself (@typescript-eslint/unbound-method flags the
      // latter as an unbound method reference).
      const getCardSpy = jest.spyOn(client, 'getCard').mockResolvedValue({
        id: 'card_9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        customerId: 'cus_1',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      expect(getCardSpy).toHaveBeenCalledWith('cus_1', 'card_9');
      expect(result.card).toEqual({
        id: 'card_9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      });
    });

    it('does not look up a card when there is no customer to save to', async () => {
      orderCreate.mockResolvedValue({
        id: 'ORD06',
        status: 'processed',
        transactions: {
          payments: [
            { id: '128', payment_method: { id: 'visa', card_id: 'card_9' } },
          ],
        },
      });
      const getCardSpy = jest.spyOn(client, 'getCard');

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      expect(getCardSpy).not.toHaveBeenCalled();
      expect(result.card).toBeUndefined();
    });
  });

  describe('MercadoPagoClient.getCard', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("finds the matching card in the customer's card list", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve([
            { id: 'card_other', last_four_digits: '1111' },
            {
              id: 'card_9',
              last_four_digits: '4242',
              payment_method: { id: 'visa' },
              expiration_month: 12,
              expiration_year: 2030,
            },
          ]),
      });

      const result = await client.getCard('cus_1', 'card_9');

      expect(result).toEqual({
        id: 'card_9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.mercadopago.com/v1/customers/cus_1/cards',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer fake-access-token-for-tests',
          }) as Record<string, string>,
        }),
      );
    });

    it('returns undefined when no card in the list matches', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve([{ id: 'card_other' }]),
      });

      const result = await client.getCard('cus_1', 'card_9');

      expect(result).toBeUndefined();
    });

    it('wraps a failed request as MercadoPagoUnavailableError', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('server error'),
      });

      await expect(client.getCard('cus_1', 'card_9')).rejects.toBeInstanceOf(
        MercadoPagoUnavailableError,
      );
    });
  });
});
