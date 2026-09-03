import type { Plan } from '../plan/entity/plan.entity';
import type { PlanDuration } from '../plan/entity/plan-duration.entity';
import { resolveTerm } from '../plan/plan-duration.rules';

export interface CheckoutSummary {
  planId: number;
  planName: string;
  months: number;
  /** The reference monthly rate, before any multi-month price. */
  monthlyPrice: number;
  /** monthlyPrice * months — what the term would cost bought one month at a time. */
  subtotal: number;
  /** subtotal - total. Derived, never stored, so it cannot drift from the prices. */
  discount: number;
  /** What will actually be charged. */
  total: number;
  currency: 'ARS';
  availableMonths: number[];
}

/**
 * The priced summary of selling `plan` for `months`, and every term the plan
 * offers. Pure — the caller loads the plan and its durations.
 *
 * Throws whatever `resolveTerm` throws when the plan has no price for
 * `months`, so an unsellable term fails here rather than at charge time.
 */
export function buildSummary(
  plan: Plan,
  months: number,
  durations: PlanDuration[],
): CheckoutSummary {
  const term = resolveTerm(plan, months, durations);
  const monthlyPrice = Number(plan.price);
  const subtotal = monthlyPrice * months;

  return {
    planId: plan.id,
    planName: plan.name,
    months: term.months,
    monthlyPrice,
    subtotal,
    // An admin can price a longer term above the monthly rate. Reporting that
    // as a negative discount would render "Descuento −$-40.014"; there is
    // simply no discount to show.
    discount: Math.max(0, subtotal - term.price),
    total: term.price,
    currency: 'ARS',
    availableMonths: [
      1,
      ...durations
        .filter((duration) => !duration.deleted)
        .map((duration) => duration.months)
        .sort((a, b) => a - b),
    ],
  };
}
