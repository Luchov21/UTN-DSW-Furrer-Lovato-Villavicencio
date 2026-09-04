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
