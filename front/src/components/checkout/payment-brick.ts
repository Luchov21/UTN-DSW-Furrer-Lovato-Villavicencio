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

// Maps every accepted spelling of `selectedPaymentMethod` to Mercado Pago's
// canonical snake_case `payment_type_id` value.
//
// The combined Payment Brick that PaymentForm.tsx mounts is the only caller
// of classifySubmission (CardForm.tsx's CardPayment Brick errors out itself
// before this runs — see its own onSubmit). That Brick's own declared type
// for this exact field, `TPaymentBrickPaymentType`
// (node_modules/@mercadopago/sdk-react/esm/bricks/payment/type.d.ts), spells
// the card types in camelCase — confirmed independently by PaymentForm.tsx's
// own `paymentMethods` customization, which configures this same Brick with
// the matching camelCase keys (creditCard/debitCard/prepaidCard). The
// snake_case spellings are also accepted defensively: this codebase has at
// least one documented case (MercadoPagoClient.createPreference, per Task
// 9's review) of an SDK .d.ts lagging the real runtime shape. Whichever
// spelling comes in, the value on the right is what gets used downstream —
// so a camelCase `selectedPaymentMethod` never leaks into a `paymentTypeId`,
// which must always be MP's own vocabulary (see the doc comment below).
const CARD_METHOD_TYPE_IDS: Record<string, string> = {
  creditCard: 'credit_card',
  debitCard: 'debit_card',
  prepaidCard: 'prepaid_card',
  credit_card: 'credit_card',
  debit_card: 'debit_card',
  prepaid_card: 'prepaid_card',
};

/**
 * `paymentTypeId` is read from `additionalData` first and from
 * `selectedPaymentMethod` second. Both must resolve to Mercado Pago's own
 * `payment_type_id` vocabulary ('credit_card', 'debit_card', ...) — it's
 * what the backend and MP's Payments API expect, and it's where the Card
 * Payment Brick always puts `additionalData.paymentTypeId` (commit e2a0e88
 * fixed a version of this that read the wrong argument and silently sent
 * undefined).
 *
 * `selectedPaymentMethod` is only a fallback for a Payment Brick submission
 * that didn't populate `additionalData`, and it does NOT arrive in that same
 * vocabulary: this Brick's own declared type spells card types in camelCase
 * ('creditCard' | 'debitCard' | 'prepaidCard'), not snake_case. So the
 * fallback is looked up through CARD_METHOD_TYPE_IDS rather than used
 * as-is — that map normalizes either casing to the canonical snake_case
 * value before it is returned as `paymentTypeId`. Neither `additionalData`
 * nor `selectedPaymentMethod` is assumed to be present.
 */
export function classifySubmission(
  selectedPaymentMethod: string,
  formData: BrickCardFormData,
  additionalData: { paymentTypeId?: string } | undefined,
): Submission {
  if (selectedPaymentMethod === 'wallet_purchase') {
    return { kind: 'wallet' };
  }

  if (!Object.hasOwn(CARD_METHOD_TYPE_IDS, selectedPaymentMethod)) {
    return {
      kind: 'unsupported',
      message: 'Ese medio de pago no está disponible. Elegí otro.',
    };
  }

  const paymentTypeId =
    additionalData?.paymentTypeId ??
    CARD_METHOD_TYPE_IDS[selectedPaymentMethod];

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
