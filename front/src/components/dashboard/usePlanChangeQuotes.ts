import { useEffect, useState } from 'react';
import { getPlanChangeQuote } from '../../services/checkout.service';
import type { PlanChangeQuote } from '../../types/plan-change';
import type { MembershipPlan } from '../plans/plans.data';

// One quote per plan, fetched together. Promise.allSettled rather than
// Promise.all: one plan's quote failing must not blank the other cards, which
// is the same reason PlanSection already uses allSettled for its two loads.
export function usePlanChangeQuotes(
  plans: MembershipPlan[],
  hasSubscription: boolean,
) {
  const [quotes, setQuotes] = useState<Record<number, PlanChangeQuote>>({});
  const [isLoading, setIsLoading] = useState(false);

  const ids = plans.map((plan) => plan.id).filter((id): id is number => !!id);
  // The effect keys off this joined string, not `plans` itself: the effect
  // always calls setState, and a caller that derives `plans` inline (a
  // `.map()`/`.filter()` in JSX, or this hook's own test passing a fresh
  // array literal into renderHook) hands us a new array reference on every
  // render. Depending on that reference would refire the effect every render
  // — setState triggers the next render, which recreates the array, which
  // refires the effect — forever.
  const idsKey = ids.join(',');

  useEffect(() => {
    if (!hasSubscription || ids.length === 0) {
      // Resets synchronously — no request is in flight here to gate this on,
      // same reasoning as the sibling early-return in useMemberCharge.ts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuotes({});
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void Promise.allSettled(ids.map((id) => getPlanChangeQuote(id)))
      .then((results) => {
        if (cancelled) return;
        const next: Record<number, PlanChangeQuote> = {};
        results.forEach((result) => {
          if (result.status === 'fulfilled') next[result.value.planId] = result.value;
        });
        setQuotes(next);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, hasSubscription]);

  return { quotes, isLoading };
}
