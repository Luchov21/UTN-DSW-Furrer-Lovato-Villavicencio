import { describe, expect, it } from 'vitest';
import { classifySubmission } from './payment-brick';

describe('classifySubmission', () => {
  const cardForm = { token: 'tok_1', payment_method_id: 'visa' };

  it('routes a credit card to a card charge', () => {
    expect(classifySubmission('credit_card', cardForm, undefined)).toEqual({
      kind: 'card',
      token: 'tok_1',
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
    });
  });

  it('routes a debit card to a card charge', () => {
    expect(classifySubmission('debit_card', cardForm, undefined)).toEqual({
      kind: 'card',
      token: 'tok_1',
      paymentMethodId: 'visa',
      paymentTypeId: 'debit_card',
    });
  });

  // The Payment Brick that actually calls classifySubmission reports
  // selectedPaymentMethod in camelCase (TPaymentBrickPaymentType, per
  // payment/type.d.ts), not the snake_case vocabulary above — see
  // CARD_METHOD_TYPE_IDS' comment in payment-brick.ts. Without this case,
  // the 6 hand-written snake_case strings above pass regardless of which
  // casing the real Brick emits. The expected paymentTypeId is still
  // snake_case: this function's contract is to always return Mercado
  // Pago's own payment_type_id vocabulary, no matter which casing
  // selectedPaymentMethod arrived in.
  it('routes a camelCase credit card (the real Payment Brick vocabulary) to a card charge', () => {
    expect(classifySubmission('creditCard', cardForm, undefined)).toEqual({
      kind: 'card',
      token: 'tok_1',
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
    });
  });

  // A2's fallback: additionalData wins when it is present, so the reading
  // that commit e2a0e88 established keeps working whatever the Brick reports
  // as selectedPaymentMethod.
  it('prefers additionalData.paymentTypeId when the Brick supplies it', () => {
    expect(
      classifySubmission('credit_card', cardForm, {
        paymentTypeId: 'prepaid_card',
      }),
    ).toEqual({
      kind: 'card',
      token: 'tok_1',
      paymentMethodId: 'visa',
      paymentTypeId: 'prepaid_card',
    });
  });

  // additionalData.paymentTypeId is typed as a bare string by the SDK, with
  // no casing guarantee — it must go through the same CARD_METHOD_TYPE_IDS
  // normalization as the selectedPaymentMethod fallback, or a camelCase value
  // here would reach the backend unnormalized.
  it('normalizes a camelCase additionalData.paymentTypeId', () => {
    expect(
      classifySubmission('credit_card', cardForm, {
        paymentTypeId: 'creditCard',
      }),
    ).toEqual({
      kind: 'card',
      token: 'tok_1',
      paymentMethodId: 'visa',
      paymentTypeId: 'credit_card',
    });
  });

  it('routes the Mercado Pago wallet to a redirect', () => {
    expect(classifySubmission('wallet_purchase', {}, undefined)).toEqual({
      kind: 'wallet',
    });
  });

  it('refuses a card submission with no token', () => {
    expect(
      classifySubmission(
        'credit_card',
        { payment_method_id: 'visa' },
        undefined,
      ),
    ).toEqual({
      kind: 'unsupported',
      message: 'No se pudo leer los datos de tu tarjeta. Probá de nuevo.',
    });
  });

  it('refuses a method this checkout does not accept', () => {
    expect(classifySubmission('ticket', {}, undefined)).toEqual({
      kind: 'unsupported',
      message: 'Ese medio de pago no está disponible. Elegí otro.',
    });
  });
});
