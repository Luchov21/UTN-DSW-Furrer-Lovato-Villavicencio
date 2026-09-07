import { parsePriceInput } from '../../lib/currency';
import type { DurationMonths, Plan, PlanDuration } from '../../types/plan';
import type { PlanChangeQuote } from '../../types/plan-change';

export type ChargeMonths = 1 | DurationMonths;

// Moved here from RegisterPaymentForm, which is again the only owner now that
// the counter's own form offers CHARGE_METHODS below. The backend's
// @IsIn on PlanCheckoutDto.payMethod is the list this must match.
export const PAY_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'debito', label: 'Débito' },
  { value: 'credito', label: 'Crédito' },
  { value: 'transferencia', label: 'Transferencia' },
] as const;

// The four methods the counter offers. Débito/crédito aren't listed here —
// card charges go through 'point' instead. 'point' and 'qr' are dispatched to
// Mercado Pago and settle asynchronously through the webhook; the rest are
// recorded immediately by plan-checkout.
export const CHARGE_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'point', label: 'Tarjeta (Point)' },
  { value: 'qr', label: 'QR' },
] as const;

export type ChargeMethod = (typeof CHARGE_METHODS)[number]['value'];

// Also narrows: submit() below relies on this to type the charge-order
// payload's `method` field without a cast.
export const isOrderMethod = (method: string): method is 'point' | 'qr' =>
  method === 'point' || method === 'qr';

// What the wizard needs from a completed charge: the plan and term it created
// the subscription on, so the resumen step can show them without refetching.
export interface ChargeSummary {
  plan: Plan;
  months: ChargeMonths;
  amount: number;
  method: ChargeMethod;
  termLabel: string;
}

export const summarizeCharge = (
  plan: Plan,
  months: ChargeMonths,
  amount: number,
  method: ChargeMethod,
): ChargeSummary => ({
  plan,
  months,
  amount,
  method,
  termLabel: months === 1 ? '1 mes' : `${months} meses`,
});

export interface ChargeFormInput {
  planId: number | '';
  months: ChargeMonths;
  amountText: string;
}

const monthsLabel = (months: ChargeMonths): string =>
  months === 1 ? '1 mes' : `${months} meses`;

// One month is always on offer and always reads the plan's own price. The
// longer terms appear only when the plan actually has a PlanDuration for them.
export const durationOptionsFor = (
  plan: Plan | null,
  durations: PlanDuration[],
): { months: ChargeMonths; label: string }[] => {
  if (!plan) return [];
  const longer = durations
    .filter((d) => !d.deleted)
    .map((d) => d.months)
    .sort((a, b) => a - b);
  return [1 as ChargeMonths, ...longer].map((months) => ({
    months,
    label: monthsLabel(months),
  }));
};

// Mirrors the backend's resolveTerm. Returns null when the plan does not offer
// that term, so the caller can say so instead of leaving stale money on screen.
export const resolvedPriceFor = (
  plan: Plan | null,
  durations: PlanDuration[],
  months: ChargeMonths,
): number | null => {
  if (!plan) return null;
  // DECIMAL columns arrive as strings; Number() is not optional here.
  if (months === 1) return Number(plan.price);
  const match = durations.find((d) => d.months === months && !d.deleted);
  return match ? Number(match.price) : null;
};

// Same checks the API runs, so the admin sees the problem without a round trip.
export const findChargeFormError = (input: ChargeFormInput): string | null => {
  if (!input.planId) return 'Elegí un plan.';
  const amount = parsePriceInput(input.amountText);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Ingresá un monto válido.';
  }
  return null;
};

// The shape useMemberCharge reads off the member's live subscription to
// decide the plan picker's default — a structural subset of Subscription, so
// this stays testable without importing the full entity shape.
export interface ActiveSubscriptionLike {
  planId: number;
  scheduledPlanId?: number | null;
}

// The plan the picker opens on. Renewing a member with a pending downgrade
// (applyPlanChange's scheduledPlanId) at the counter must default to THAT
// plan, not the pricier one they're about to leave — otherwise a manual
// front-desk renewal silently re-confirms the old plan and the member never
// gets the change they already asked for. See Task 9's audit: this is what
// closes that gap. Falls back to the member's actual current plan when there
// is nothing scheduled, and to '' when the member has no active subscription
// at all (unchanged from before this existed).
export const defaultPlanIdFor = (
  active: ActiveSubscriptionLike | null | undefined,
): number | '' => active?.scheduledPlanId ?? active?.planId ?? '';

// Whether the selected plan is a genuine change worth quoting — both a
// member's current plan and a different target plan must be known. `''`
// (nothing picked), picking back the member's own current plan, and a member
// with no active subscription at all (a brand-new sale, not a change — the
// backend would just answer 'no_active_subscription' and its amount, 0,
// would wrongly stomp the new member's list price) all read as "nothing to
// quote".
export const isPlanChangeCandidate = (
  planId: number | '',
  currentPlanId: number | null,
): planId is number =>
  typeof planId === 'number' &&
  currentPlanId !== null &&
  planId !== currentPlanId;

// The advisory pre-fill from an admin plan-change quote.
//
// An eligible UPGRADE deliberately returns null (= "don't pre-fill
// anything, leave whatever is already on screen") rather than the quote's
// prorated amount. The front-desk write path this form submits to —
// PaymentService.registerPlanPayment, and the point/QR createChargeOrder
// path — has no branch for a prorated plan change: it always resolves a
// brand-new full term via resolveTerm(plan, dto.months, durations) and
// writes soldPrice as whatever amount the admin charges. If this pre-filled
// the tiny prorated amount and the admin accepted it as-is for a genuine
// upgrade, the resulting subscription would (a) get a fresh full term
// instead of keeping the old endDate — a free extra term for the member —
// and (b) record soldPrice as the prorated sliver instead of the new plan's
// real price, corrupting MRR reporting. (Final whole-branch review, Critical
// finding.) Returning null here is the same "nothing to pre-fill" outcome
// the caller already gets when there is no applicable quote at all, so the
// admin sees the list price that was already there and must type the real
// charge themselves — exactly as before this pre-fill existed.
//
// Downgrade and lateral moves keep pre-filling 0: self-service never charges
// either one, and 0 does not carry the same "looks like a real charge"
// danger the prorated upgrade amount does.
export const amountForPlanChangeQuote = (quote: PlanChangeQuote): number | null =>
  quote.eligible && quote.direction === 'upgrade' ? null : 0;
