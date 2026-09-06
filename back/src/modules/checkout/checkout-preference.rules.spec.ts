import {
  buildPreferenceBody,
  PREFERENCE_EXPIRATION_MS,
} from './checkout-preference.rules';

describe('buildPreferenceBody', () => {
  const now = new Date('2026-09-04T12:00:00.000Z');
  const input = {
    planName: 'Plan Full',
    amount: 19995,
    externalReference: 'flg-user-7-a1b2c3d4',
    payerEmail: 'socio@example.com',
    frontendUrl: 'https://flg.example.com',
    now,
  };

  it('sells exactly one item, priced by the server', () => {
    const body = buildPreferenceBody(input);
    expect(body.items).toEqual([
      {
        title: 'Membresía FLG — Plan Full',
        quantity: 1,
        unit_price: 19995,
        currency_id: 'ARS',
      },
    ]);
  });

  it('carries the external reference the webhook resolves on', () => {
    expect(buildPreferenceBody(input).external_reference).toBe(
      'flg-user-7-a1b2c3d4',
    );
  });

  it('requires a logged-in Mercado Pago payer', () => {
    expect(buildPreferenceBody(input).purpose).toBe('wallet_purchase');
  });

  it('excludes cash, so it cannot reappear on the hosted page', () => {
    expect(
      buildPreferenceBody(input).payment_methods.excluded_payment_types,
    ).toEqual([{ id: 'ticket' }, { id: 'atm' }]);
  });

  it('never offers installments', () => {
    expect(buildPreferenceBody(input).payment_methods.installments).toBe(1);
  });

  it('returns the member to the checkout return page on every outcome', () => {
    const { back_urls: backUrls, auto_return: autoReturn } =
      buildPreferenceBody(input);
    const expected = 'https://flg.example.com/checkout/return';
    expect(backUrls).toEqual({
      success: expected,
      pending: expected,
      failure: expected,
    });
    expect(autoReturn).toBe('approved');
  });

  it('drops a trailing slash on the frontend URL rather than doubling it', () => {
    const body = buildPreferenceBody({
      ...input,
      frontendUrl: 'https://flg.example.com/',
    });
    expect(body.back_urls.success).toBe(
      'https://flg.example.com/checkout/return',
    );
  });

  it('omits auto_return against a localhost frontend URL', () => {
    // Mercado Pago rejects preference creation with "auto_return invalid.
    // back_url.success must be defined" whenever back_urls points at
    // localhost/127.0.0.1 — confirmed against the live API. back_urls
    // itself is still sent, so "Volver al sitio" keeps working locally.
    const body = buildPreferenceBody({
      ...input,
      frontendUrl: 'http://localhost:5173',
    });
    expect(body.auto_return).toBeUndefined();
    expect(body.back_urls.success).toBe('http://localhost:5173/checkout/return');
  });

  it('omits auto_return against a bare 127.0.0.1 frontend URL, with or without a port', () => {
    expect(
      buildPreferenceBody({ ...input, frontendUrl: 'http://127.0.0.1:5173' })
        .auto_return,
    ).toBeUndefined();
    expect(
      buildPreferenceBody({ ...input, frontendUrl: 'http://127.0.0.1' })
        .auto_return,
    ).toBeUndefined();
  });

  it('expires, so an unarmed preference cannot be paid indefinitely', () => {
    const body = buildPreferenceBody(input);
    expect(body.expires).toBe(true);
    expect(body.expiration_date_to).toBe(
      new Date(now.getTime() + PREFERENCE_EXPIRATION_MS).toISOString(),
    );
  });
});
