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
  months: number;
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
