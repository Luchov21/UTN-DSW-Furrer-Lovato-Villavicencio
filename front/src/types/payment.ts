import type { Subscription } from './subscription';

export interface Payment {
  id?: number;
  subscriptionId: number;
  subscription?: Subscription;
  amount: number;
  date: string;
  payMethod: string;
  state?: string;
  registeredById?: number | null;
  // Populated by the backend join when available; a raw id means nothing to
  // staff, so the admin table renders this instead.
  registeredByName?: string | null;
  termMonths?: number;
  // MySQL DECIMAL columns — may arrive as strings despite these types.
  monthlyPriceAtPurchase?: number | string;
  refundedAmount?: number | string | null;
  refundedAt?: string | null;
  deleted?: boolean;
  // Set by POST /Payment/manual and /Payment/checkout only, and only for an
  // efectivo/transferencia payment: whether the informational ticket printed
  // on the front desk's Point terminal. Absent for every other payMethod —
  // never treat "undefined" as a failure.
  printStatus?: 'sent' | 'error' | 'not_configured';
  printError?: string;
}

// Body of POST /Payment/manual: an in-person payment recorded by an admin.
export interface ManualPaymentPayload {
  subscriptionId: number;
  amount: number;
  payMethod: 'efectivo' | 'debito' | 'credito' | 'transferencia';
  // Only meaningful for an advance payment against an already-ACTIVE
  // subscription; the backend defaults to 1 when omitted.
  termMonths?: number;
}

// What GET /Payment returns. Distinct from Payment because a persisted row
// always has an id — the optional one on Payment describes a create payload —
// and because registeredByName exists only on this projection. Without the
// distinction, the table needed `p.id ?? Math.random()` as a React key, which
// would have remounted every row on every render had it ever been reached.
export interface AdminPayment extends Omit<Payment, 'id' | 'amount'> {
  id: number;
  // DECIMAL arrives from the API as a string; see lib/currency.ts.
  amount: number | string;
}

export interface PaymentPage {
  items: AdminPayment[];
  total: number;
}

// Body of POST /Payment/checkout: one in-person sale.
export interface PlanCheckoutPayload {
  userId: number;
  planId: number;
  months: 1 | 3 | 6 | 12;
  amount: number;
  payMethod: 'efectivo' | 'debito' | 'credito' | 'transferencia';
}
