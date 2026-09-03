// Plan and term travel in the query string, not in router state: this flow
// crosses a registration round-trip and may be reopened in a new tab, and
// router state survives neither.
const ALLOWED_MONTHS = [1, 3, 6, 12];

export interface CheckoutParams {
  planId: number | null;
  months: number;
}

export function readCheckoutParams(search: string): CheckoutParams {
  const params = new URLSearchParams(search);

  const rawPlan = params.get('plan');
  const planId = rawPlan && /^\d+$/.test(rawPlan) ? Number(rawPlan) : null;

  const rawMonths = Number(params.get('months'));
  const months = ALLOWED_MONTHS.includes(rawMonths) ? rawMonths : 1;

  return { planId, months };
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
