import type { PlanChangeQuote } from '../../types/plan-change';

// What confirmChange does once the member confirms a plan pick: send them to
// checkout (money changes hands, or it's a first-time purchase) or apply the
// change directly (a free downgrade or lateral move).
export type PlanChangeAction =
  { type: 'checkout'; url: string } | { type: 'apply' };

// A member with no current subscription is not "changing" plans — the
// backend's own assessChange() treats it as a normal first-time purchase
// (plan-change.rules.ts: "not an error at the call site"), and
// usePlanChangeQuotes never even fetches a quote for that case, so `quote` is
// always undefined here. Everyone else either pays through checkout (an
// upgrade) or gets the free change applied immediately (downgrade/lateral).
export function resolvePlanChangeAction(
  planId: number,
  hasSubscription: boolean,
  quote: PlanChangeQuote | undefined,
): PlanChangeAction {
  if (!hasSubscription) {
    return { type: 'checkout', url: `/checkout?plan=${planId}&months=1` };
  }
  if (quote?.direction === 'upgrade') {
    return {
      type: 'checkout',
      url: `/checkout?plan=${planId}&mode=plan-change`,
    };
  }
  return { type: 'apply' };
}
