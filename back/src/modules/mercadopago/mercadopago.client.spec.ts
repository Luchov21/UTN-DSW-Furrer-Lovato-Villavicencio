import { MercadoPagoConfig } from './mercadopago.config';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
  mapOrderStatusToPaymentStatus,
} from './mercadopago.client';

// The SDK's client classes (Payment, Customer, ...) are constructed fresh
// per call — `new Order(sdkConfig)` inside each MercadoPagoClient method —
// rather than injected, so the whole `mercadopago` module is mocked here.
// Each class's methods are backed by a jest.fn() the tests assert against.
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
let orderRefund: jest.Mock;

interface CardTokenCreateArgs {
  body: { card_id: string; customer_id: string };
}

interface CardTokenLike {
  id?: string;
}

let cardTokenCreate: jest.Mock<Promise<CardTokenLike>, [CardTokenCreateArgs]>;

interface CardLike {
  id?: string;
  last_four_digits?: string;
  payment_method?: { id?: string; payment_type_id?: string };
  expiration_month?: number;
  expiration_year?: number;
}

let customerCreateCard: jest.Mock<Promise<CardLike>, [unknown]>;
let customerListCards: jest.Mock<Promise<CardLike[]>, [unknown]>;

// Loosely typed, like `orderRefund` above — the tests below only ever
// resolve/reject it with a plain object, never assert on its own type.
let preferenceCreate: jest.Mock;

/** Mirrors how `Customer.createCard`/`Customer.listCards` are swapped in above. */
function mockPreferenceCreate(impl: jest.Mock): void {
  preferenceCreate = impl;
}

jest.mock('mercadopago', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({})),
  Payment: jest.fn().mockImplementation(() => ({})),
  Customer: jest.fn().mockImplementation(() => ({
    createCard: customerCreateCard,
    listCards: customerListCards,
  })),
  CardToken: jest.fn().mockImplementation(() => ({ create: cardTokenCreate })),
  PaymentRefund: jest.fn().mockImplementation(() => ({})),
  Order: jest.fn().mockImplementation(() => ({
    create: orderCreate,
    get: jest.fn(),
    cancel: jest.fn(),
    refund: orderRefund,
  })),
  Preference: jest.fn().mockImplementation(() => ({
    create: preferenceCreate,
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
    client = new MercadoPagoClient(configOf(ENABLED_ENV));
  });

  describe('MercadoPagoClient.chargeCardToken', () => {
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    // chargeOnlineOrder talks to POST /v1/orders via raw fetch, not the
    // SDK's Order client (see its own doc comment: the SDK's error parser
    // silently drops the `{ errors: [...] }` shape this endpoint uses for
    // validation failures) — so these tests mock global.fetch, not
    // orderCreate.
    function mockOrderFetch(status: number, body: unknown): void {
      fetchMock = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
    }

    function sentBody(): Record<string, unknown> {
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      return JSON.parse(init.body as string) as Record<string, unknown>;
    }

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('sends an online order with the token, amount and payment method', async () => {
      mockOrderFetch(200, {
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

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.mercadopago.com/v1/orders',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Idempotency-Key': 'checkout-tok_abc',
          }) as Record<string, string>,
        }),
      );
      expect(sentBody()).toEqual(
        expect.objectContaining({
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
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({
          id: '123',
          status: 'approved',
          mpOrderId: 'ORD01',
        }),
      );
    });

    it('scopes the payer to a customer when one is given', async () => {
      mockOrderFetch(200, {
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

      expect(sentBody().payer).toEqual({ customer_id: 'cus_1' });
    });

    it('falls back to a plain email payer with no customer', async () => {
      mockOrderFetch(200, {
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

      expect(sentBody().payer).toEqual({ email: 'rosa@gmail.com' });
    });

    it('wraps a network failure as MercadoPagoUnavailableError', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;

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

    it('surfaces the real validation reason from a 400 errors[] response', async () => {
      // The exact shape confirmed against the live API for this endpoint —
      // NOT the older { message, cause: [...] } shape the SDK's own error
      // parser understands. This is the case the raw-fetch approach exists
      // to fix: without it, this 400 collapses to a bare "MercadoPago API
      // error" with no indication of what was actually wrong.
      mockOrderFetch(400, {
        errors: [
          {
            code: 'property_value',
            message: "'$.payer.customer_id' - length must be >= 1, but got 0",
          },
        ],
      });

      await expect(
        client.chargeCardToken({
          token: 'tok_abc',
          amount: 19995,
          externalReference: 'flg-user-3-abcd1234',
          idempotencyKey: 'checkout-tok_abc',
          customerId: '',
          paymentMethodId: 'visa',
          paymentTypeId: 'credit_card',
        }),
      ).rejects.toThrow(/customer_id.*length must be/);
    });

    it('does not treat a rejected order as an error', async () => {
      mockOrderFetch(200, {
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
      mockOrderFetch(200, {
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
        paymentTypeId: 'credit_card',
        expirationMonth: 12,
        expirationYear: 2030,
      });
    });

    it('does not look up a card when there is no customer to save to', async () => {
      mockOrderFetch(200, {
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

    it('still resolves with the approved charge when the post-charge getCard lookup fails', async () => {
      // The order already charged successfully by the time getCard runs — a
      // lookup failure here must degrade to "no card details", never fail
      // the whole charge and report an approved payment as an outage.
      mockOrderFetch(200, {
        id: 'ORD07',
        status: 'processed',
        status_detail: 'accredited',
        total_paid_amount: 19995,
        transactions: {
          payments: [
            {
              id: '129',
              payment_method: {
                id: 'visa',
                type: 'credit_card',
                card_id: 'card_9',
              },
            },
          ],
        },
      });
      jest
        .spyOn(client, 'getCard')
        .mockRejectedValue(new MercadoPagoUnavailableError('network hiccup'));

      const result = await client.chargeCardToken({
        token: 'tok_abc',
        amount: 19995,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-tok_abc',
        customerId: 'cus_1',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
      });

      expect(result).toEqual(
        expect.objectContaining({
          id: '129',
          status: 'approved',
          mpOrderId: 'ORD07',
        }),
      );
      expect(result.card).toBeUndefined();
    });
  });

  describe('MercadoPagoClient.chargeSavedCard', () => {
    let fetchMock: jest.Mock;
    const originalFetch = global.fetch;

    function mockOrderFetch(status: number, body: unknown): void {
      fetchMock = jest.fn().mockResolvedValue({
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(body),
      });
      global.fetch = fetchMock as unknown as typeof fetch;
    }

    function sentBody(): Record<string, unknown> {
      const init = fetchMock.mock.calls[0][1] as RequestInit;
      return JSON.parse(init.body as string) as Record<string, unknown>;
    }

    beforeEach(() => {
      cardTokenCreate = jest.fn<
        Promise<CardTokenLike>,
        [CardTokenCreateArgs]
      >();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('mints a fresh token from the saved card, then charges it as an online order', async () => {
      cardTokenCreate.mockResolvedValue({ id: 'fresh_tok_1' });
      mockOrderFetch(200, {
        id: 'ORD10',
        status: 'processed',
        transactions: { payments: [{ id: '200' }] },
      });
      const result = await client.chargeSavedCard({
        customerId: 'cus_1',
        cardId: 'card_1',
        amount: 12000,
        description: 'Renovación',
        idempotencyKey: 'renewal-7-2026-09-10',
        paymentMethodId: 'master',
        paymentTypeId: 'credit_card',
      });

      expect(cardTokenCreate).toHaveBeenCalledWith({
        body: { card_id: 'card_1', customer_id: 'cus_1' },
      });
      const body = sentBody() as {
        payer: { customer_id: string };
        transactions: {
          payments: Array<{ payment_method: { token: string } }>;
        };
      };
      expect(body.payer).toEqual({ customer_id: 'cus_1' });
      expect(body.transactions.payments[0].payment_method.token).toBe(
        'fresh_tok_1',
      );
      expect(result).toEqual(
        expect.objectContaining({ id: '200', status: 'approved' }),
      );
    });

    it('forwards the external reference to the order, when given', async () => {
      cardTokenCreate.mockResolvedValue({ id: 'fresh_tok_3' });
      mockOrderFetch(200, {
        id: 'ORD12',
        status: 'processed',
        transactions: { payments: [{ id: '202' }] },
      });

      await client.chargeSavedCard({
        customerId: 'cus_1',
        cardId: 'card_1',
        amount: 12000,
        externalReference: 'flg-user-3-abcd1234',
        idempotencyKey: 'checkout-flg-user-3-abcd1234',
        paymentMethodId: 'master',
        paymentTypeId: 'credit_card',
      });

      expect(sentBody().external_reference).toBe('flg-user-3-abcd1234');
    });

    it('does not fetch card details for a renewal charge', async () => {
      cardTokenCreate.mockResolvedValue({ id: 'fresh_tok_2' });
      mockOrderFetch(200, {
        id: 'ORD11',
        status: 'processed',
        transactions: {
          payments: [
            { id: '201', payment_method: { id: 'master', card_id: 'card_1' } },
          ],
        },
      });
      // jest.spyOn rather than a raw `client.getCard = jest.fn()` reassignment
      // so the assertion below references a plain mock variable, not the
      // class method itself (@typescript-eslint/unbound-method flags the
      // latter as an unbound method reference) — same pattern used above for
      // chargeCardToken.
      const getCardSpy = jest.spyOn(client, 'getCard');

      await client.chargeSavedCard({
        customerId: 'cus_1',
        cardId: 'card_1',
        amount: 12000,
        idempotencyKey: 'renewal-7-2026-09-10',
        paymentMethodId: 'master',
        paymentTypeId: 'credit_card',
      });

      expect(getCardSpy).not.toHaveBeenCalled();
    });

    it('wraps a token-minting failure as MercadoPagoUnavailableError', async () => {
      cardTokenCreate.mockRejectedValue(new Error('card token minting failed'));

      await expect(
        client.chargeSavedCard({
          customerId: 'cus_1',
          cardId: 'card_1',
          amount: 12000,
          idempotencyKey: 'renewal-7-2026-09-10',
          paymentMethodId: 'master',
          paymentTypeId: 'credit_card',
        }),
      ).rejects.toBeInstanceOf(MercadoPagoUnavailableError);
    });
  });

  describe('MercadoPagoClient.saveCard', () => {
    beforeEach(() => {
      customerCreateCard = jest.fn<Promise<CardLike>, [unknown]>();
    });

    it("maps the card's payment type from payment_method.payment_type_id", async () => {
      customerCreateCard.mockResolvedValue({
        id: 'card_1',
        last_four_digits: '4242',
        payment_method: { id: 'visa', payment_type_id: 'credit_card' },
        expiration_month: 12,
        expiration_year: 2030,
      });

      const result = await client.saveCard('cus_1', 'tok_abc');

      expect(result).toEqual({
        id: 'card_1',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
        expirationMonth: 12,
        expirationYear: 2030,
      });
    });
  });

  describe('MercadoPagoClient.getCard', () => {
    beforeEach(() => {
      customerListCards = jest.fn<Promise<CardLike[]>, [unknown]>();
    });

    it("finds the matching card in the customer's card list", async () => {
      customerListCards.mockResolvedValue([
        { id: 'card_other', last_four_digits: '1111' },
        {
          id: 'card_9',
          last_four_digits: '4242',
          payment_method: { id: 'visa', payment_type_id: 'credit_card' },
          expiration_month: 12,
          expiration_year: 2030,
        },
      ]);

      const result = await client.getCard('cus_1', 'card_9');

      expect(result).toEqual({
        id: 'card_9',
        lastFourDigits: '4242',
        paymentMethodId: 'visa',
        paymentTypeId: 'credit_card',
        expirationMonth: 12,
        expirationYear: 2030,
      });
      expect(customerListCards).toHaveBeenCalledWith({ customerId: 'cus_1' });
    });

    it('returns undefined when no card in the list matches', async () => {
      customerListCards.mockResolvedValue([{ id: 'card_other' }]);

      const result = await client.getCard('cus_1', 'card_9');

      expect(result).toBeUndefined();
    });

    it('wraps an SDK failure as MercadoPagoUnavailableError', async () => {
      customerListCards.mockRejectedValue(new Error('network down'));

      await expect(client.getCard('cus_1', 'card_9')).rejects.toBeInstanceOf(
        MercadoPagoUnavailableError,
      );
    });

    it('wraps a non-array success response as MercadoPagoUnavailableError, not a raw TypeError', async () => {
      // A malformed 200 response used to crash the raw-fetch implementation
      // with an unhandled TypeError instead of the coarse error every other
      // failure produces — the SDK call, inside the same try/catch every
      // other method uses, no longer has this gap.
      customerListCards.mockResolvedValue(null as unknown as CardLike[]);

      await expect(client.getCard('cus_1', 'card_9')).rejects.toBeInstanceOf(
        MercadoPagoUnavailableError,
      );
    });
  });

  describe('MercadoPagoClient.refundOrder', () => {
    beforeEach(() => {
      orderRefund = jest.fn();
    });

    it('issues a partial refund for one transaction', async () => {
      orderRefund.mockResolvedValue({
        id: 'ORD01',
        status: 'processed',
        status_detail: 'partially_refunded',
      });

      const result = await client.refundOrder(
        'ORD01',
        'PAY01',
        7000,
        'refund-55',
      );

      expect(orderRefund).toHaveBeenCalledWith({
        id: 'ORD01',
        body: { transactions: [{ id: 'PAY01', amount: '7000.00' }] },
        requestOptions: { idempotencyKey: 'refund-55' },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'ORD01', status: 'processed' }),
      );
    });

    it('wraps an SDK failure as MercadoPagoUnavailableError', async () => {
      orderRefund.mockRejectedValue(new Error('refund_amount_exceeds'));

      await expect(
        client.refundOrder('ORD01', 'PAY01', 7000, 'refund-55'),
      ).rejects.toBeInstanceOf(MercadoPagoUnavailableError);
    });
  });

  describe('createPreference', () => {
    const input = {
      planName: 'Plan Full',
      amount: 19995,
      externalReference: 'flg-user-7-a1b2c3d4',
      payerEmail: 'socio@example.com',
      frontendUrl: 'https://flg.example.com',
      now: new Date('2026-09-04T12:00:00.000Z'),
    };

    it('sends the built body and returns the id and init point', async () => {
      const create = jest.fn().mockResolvedValue({
        id: 'pref-123',
        init_point: 'https://mp.example.com/checkout?pref_id=pref-123',
      });
      mockPreferenceCreate(create);

      const result = await client.createPreference(input);

      expect(create).toHaveBeenCalledWith({
        body: expect.objectContaining({
          purpose: 'wallet_purchase',
          external_reference: 'flg-user-7-a1b2c3d4',
        }) as Record<string, unknown>,
      });
      expect(result).toEqual({
        id: 'pref-123',
        initPoint: 'https://mp.example.com/checkout?pref_id=pref-123',
      });
    });

    it('throws MercadoPagoUnavailableError when the SDK rejects', async () => {
      mockPreferenceCreate(jest.fn().mockRejectedValue(new Error('boom')));

      await expect(client.createPreference(input)).rejects.toBeInstanceOf(
        MercadoPagoUnavailableError,
      );
    });

    it('refuses a response with no preference id rather than returning undefined', async () => {
      mockPreferenceCreate(jest.fn().mockResolvedValue({}));

      await expect(client.createPreference(input)).rejects.toBeInstanceOf(
        MercadoPagoUnavailableError,
      );
    });
  });
});
