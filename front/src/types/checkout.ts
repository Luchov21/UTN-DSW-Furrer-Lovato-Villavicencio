// Mirrors back/src/modules/checkout/checkout.rules.ts. Every amount is a
// number in ARS units, never cents.
export interface CheckoutSummary {
  planId: number;
  planName: string;
  months: number;
  monthlyPrice: number;
  subtotal: number;
  discount: number;
  total: number;
  currency: 'ARS';
  availableMonths: number[];
  // Set only when this summary was adapted from a plan-change quote
  // (see planChangeQuoteToSummary): `monthlyPrice`/`subtotal`/`total` all
  // carry the same one-time proration top-up, not a new recurring price, so
  // OrderSummary must render it as a single adjustment rather than as
  // "$X / mes" / "Subtotal (N × $X)" — showing either would read as the
  // member's monthly price having changed, which it hasn't. Absent (the
  // default) renders the existing recurring-purchase copy unchanged.
  isOneTimeAdjustment?: boolean;
}

export interface CheckoutResult {
  status: 'approved' | 'rejected' | 'in_process';
  statusDetail?: string;
  paymentId?: number;
  /** 'YYYY-MM-DD'. Present only when approved. */
  newEndDate?: string;
  planName?: string;
  amount?: number;
  months?: number;
}

// Mirrors CheckoutDto. No amount: the backend resolves the price itself.
export interface CheckoutPayload {
  planId: number;
  // Optional: a plan-change checkout prices the proration itself and has no
  // term to pick, so `months` has nothing to carry.
  months?: number;
  // Absent (the default) is a term purchase. 'plan-change' charges the
  // member-specific upgrade proration instead of a term price.
  mode?: 'term' | 'plan-change';
  cardToken?: string;
  paymentMethodId?: string;
  paymentTypeId?: string;
  useSavedCard?: boolean;
  saveCard?: boolean;
  acceptedTerms: true;
}

// Mirrors the response of POST /checkout/preference.
export interface CheckoutPreference {
  preferenceId: string;
  externalReference: string;
  amount: number;
}

// Mirrors CheckoutStatusResult. 'pending' means the webhook has not settled
// the payment yet — not that it failed.
export interface CheckoutStatus {
  status: 'pending' | 'approved' | 'rejected';
  paymentId?: number;
  newEndDate?: string;
  planName?: string;
  amount?: number;
  months?: number;
}
