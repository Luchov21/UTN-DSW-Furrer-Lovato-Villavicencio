// The Payment Brick reports which method the member picked and hands back a
// form payload whose shape depends on that choice. Everything about reading
// that pair lives here rather than in the component, so it can be asserted
// without rendering a Brick — the same reason useCheckoutParams and
// checkout-messages exist.

export interface BrickCardFormData {
  token?: string;
  payment_method_id?: string;
}

export type Submission =
  | {
      kind: 'card';
      token: string;
      paymentMethodId: string;
      paymentTypeId: string;
    }
  | { kind: 'wallet' }
  | { kind: 'unsupported'; message: string };

const CARD_METHODS = ['credit_card', 'debit_card', 'prepaid_card'];

/**
 * `paymentTypeId` is read from `additionalData` first and from
 * `selectedPaymentMethod` second. The first is where the Card Payment Brick
 * put it (commit e2a0e88 fixed a version of this that read the wrong
 * argument and silently sent undefined); the second carries the same
 * vocabulary — 'credit_card', 'debit_card' — and covers the Brick that does
 * not populate additionalData. Neither is assumed to be present.
 */
export function classifySubmission(
  selectedPaymentMethod: string,
  formData: BrickCardFormData,
  additionalData: { paymentTypeId?: string } | undefined,
): Submission {
  if (selectedPaymentMethod === 'wallet_purchase') {
    return { kind: 'wallet' };
  }

  if (!CARD_METHODS.includes(selectedPaymentMethod)) {
    return {
      kind: 'unsupported',
      message: 'Ese medio de pago no está disponible. Elegí otro.',
    };
  }

  const paymentTypeId = additionalData?.paymentTypeId ?? selectedPaymentMethod;

  if (!formData.token || !formData.payment_method_id) {
    return {
      kind: 'unsupported',
      message: 'No se pudo leer los datos de tu tarjeta. Probá de nuevo.',
    };
  }

  return {
    kind: 'card',
    token: formData.token,
    paymentMethodId: formData.payment_method_id,
    paymentTypeId,
  };
}
