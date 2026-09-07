// Plan and term travel in the query string, not in router state: this flow
// crosses a registration round-trip and may be reopened in a new tab, and
// router state survives neither.
const ALLOWED_MONTHS = [1, 3, 6, 12];

// Absent (the default) or anything unrecognized reads as a term purchase —
// the same allow-list-with-fallback the checkout DTOs use server-side, so a
// stale/hand-edited link can never fall through to a mode this page doesn't
// know how to render.
const ALLOWED_MODES = ['term', 'plan-change'] as const;

export type CheckoutMode = (typeof ALLOWED_MODES)[number];

export interface CheckoutParams {
  planId: number | null;
  months: number;
  mode: CheckoutMode;
}

export function readCheckoutParams(search: string): CheckoutParams {
  const params = new URLSearchParams(search);

  const rawPlan = params.get('plan');
  const planId = rawPlan && /^\d+$/.test(rawPlan) ? Number(rawPlan) : null;

  const rawMonths = Number(params.get('months'));
  const months = ALLOWED_MONTHS.includes(rawMonths) ? rawMonths : 1;

  const rawMode = params.get('mode');
  const mode = ALLOWED_MODES.find((allowed) => allowed === rawMode) ?? 'term';

  return { planId, months, mode };
}

/**
 * A returnTo destination that cannot leave the site. A leading '//' is
 * protocol-relative and would navigate off-origin despite starting with a
 * slash — pulling a member out of a payment flow onto someone else's page.
 */
export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

/**
 * The wallet step's URL for a given purchase. One helper because three
 * callers build it — Checkout's redirect, AccountStep's returnTo, and the
 * wallet page's own duration switch — and a divergence between them silently
 * drops the plan.
 */
export function checkoutWalletUrl(
  planId: number | null,
  months: number,
  mode: CheckoutMode = 'term',
): string {
  const base = `/checkout/wallet?plan=${planId ?? ''}&months=${months}`;
  return mode === 'plan-change' ? `${base}&mode=plan-change` : base;
}
