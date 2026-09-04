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

jest.mock('mercadopago', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
  Payment: jest.fn().mockImplementation(() => ({ create: paymentCreate })),
  Customer: jest.fn().mockImplementation(() => ({})),
  CardToken: jest.fn().mockImplementation(() => ({})),
  PaymentRefund: jest.fn().mockImplementation(() => ({})),
  Order: jest.fn().mockImplementation(() => ({})),
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
    it('sends the token, amount and external reference', async () => {
      paymentCreate.mockResolvedValue({
        id: 123,
        status: 'approved',
        status_detail: 'accredited',
        transaction_amount: 19995,
        external_reference: 'flg-user-3-abcd1234',
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        description: 'Membresía FLG',
      });

      expect(paymentCreate).toHaveBeenCalledWith({
        body: expect.objectContaining({
          transaction_amount: 19995,
          token: 'tok_abc',
          external_reference: 'flg-user-3-abcd1234',
          installments: 1,
          capture: true,
        }) as Record<string, unknown>,
        requestOptions: { idempotencyKey: 'checkout-tok_abc' },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: '123', status: 'approved' }),
      );
    });

    it('scopes the payer to a customer when one is given', async () => {
      paymentCreate.mockResolvedValue({ id: 124, status: 'approved' });

      await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        customerId: 'cus_1',
      });

      const body = paymentCreate.mock.calls[0][0].body as {
        payer: { type: string; id: string };
      };
      expect(body.payer).toEqual({ type: 'customer', id: 'cus_1' });
    });

    it('falls back to a plain email payer with no customer', async () => {
      paymentCreate.mockResolvedValue({ id: 125, status: 'approved' });

      await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        payerEmail: 'rosa@gmail.com',
      });

      const body = paymentCreate.mock.calls[0][0].body as {
        payer: { email: string };
      };
      expect(body.payer).toEqual({ email: 'rosa@gmail.com' });
    });

    it('wraps an SDK failure as MercadoPagoUnavailableError', async () => {
      paymentCreate.mockRejectedValue(new Error('network down'));

      await expect(
        client.chargeCardToken({
          token: 'tok_abc',
          amount: 19995,
          externalReference: 'flg-user-3-abcd1234',
          idempotencyKey: 'checkout-tok_abc',
        }),
      ).rejects.toBeInstanceOf(MercadoPagoUnavailableError);
    });

    it('does not treat a rejected payment as an error', async () => {
      paymentCreate.mockResolvedValue({
        id: 126,
        status: 'rejected',
        status_detail: 'cc_rejected_insufficient_amount',
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
      });

      expect(result.status).toBe('rejected');
      expect(result.statusDetail).toBe('cc_rejected_insufficient_amount');
    });

    it('reports the card the payment was made with', async () => {
      // This is the only card data the checkout gets: the token it charged
      // with is single-use and already spent, so a SavedCard row can only be
      // written from the payment's own response.
      paymentCreate.mockResolvedValue({
        id: 127,
        status: 'approved',
        payment_method_id: 'visa',
        card: {
          id: 'card_9',
          last_four_digits: '4242',
          expiration_month: 12,
          expiration_year: 2030,
        },
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        customerId: 'cus_1',
      });

      expect(result.card).toEqual({
        id: 'card_9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        expirationMonth: 12,
        expirationYear: 2030,
      });
    });

    it('reports no card when the response carries none', async () => {
      // A rejected payment can come back with an empty card object; an empty
      // shell must not read as a card worth saving.
      paymentCreate.mockResolvedValue({
        id: 128,
        status: 'rejected',
        card: {},
      });

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
      });

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
