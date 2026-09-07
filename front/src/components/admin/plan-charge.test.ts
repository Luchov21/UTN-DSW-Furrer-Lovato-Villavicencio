import { describe, expect, it } from 'vitest';
import {
  amountForPlanChangeQuote,
  defaultPlanIdFor,
  durationOptionsFor,
  findChargeFormError,
  isOrderMethod,
  isPlanChangeCandidate,
  resolvedPriceFor,
  summarizeCharge,
} from './plan-charge';
import type { Plan, PlanDuration } from '../../types/plan';
import type { PlanChangeQuote } from '../../types/plan-change';

const plan: Plan = { id: 2, name: 'Premium', price: 59, numDays: 30 };
const sixMonths: PlanDuration = { id: 7, planId: 2, months: 6, numDays: 180, price: 300 };

describe('durationOptionsFor', () => {
  it('always offers one month, even with no durations', () => {
    expect(durationOptionsFor(plan, [])).toEqual([{ months: 1, label: '1 mes' }]);
  });

  it('offers only the durations the plan actually has', () => {
    expect(durationOptionsFor(plan, [sixMonths]).map((o) => o.months)).toEqual([1, 6]);
  });

  it('offers nothing when no plan is selected', () => {
    expect(durationOptionsFor(null, [sixMonths])).toEqual([]);
  });
});

describe('resolvedPriceFor', () => {
  it('reads the plan price for one month', () => {
    expect(resolvedPriceFor(plan, [], 1)).toBe(59);
  });

  it('reads the duration price for six months', () => {
    expect(resolvedPriceFor(plan, [sixMonths], 6)).toBe(300);
  });

  it('coerces a DECIMAL price that arrived as a string', () => {
    const stringPriced = { ...plan, price: '59.00' } as unknown as Plan;
    expect(resolvedPriceFor(stringPriced, [], 1)).toBe(59);
  });

  it('returns null when the plan does not offer that duration', () => {
    expect(resolvedPriceFor(plan, [], 6)).toBeNull();
  });
});

describe('findChargeFormError', () => {
  it('accepts a complete form', () => {
    expect(
      findChargeFormError({ planId: 2, months: 1, amountText: '19.995' }),
    ).toBeNull();
  });

  it('rejects a missing plan', () => {
    expect(findChargeFormError({ planId: '', months: 1, amountText: '100' })).toMatch(
      /plan/i,
    );
  });

  it('rejects a zero amount', () => {
    expect(findChargeFormError({ planId: 2, months: 1, amountText: '0' })).toMatch(
      /monto/i,
    );
  });

  it('rejects an unparseable amount', () => {
    expect(findChargeFormError({ planId: 2, months: 1, amountText: 'nada' })).toMatch(
      /monto/i,
    );
  });
});

describe('isOrderMethod', () => {
  it('routes point and qr through a charge order', () => {
    expect(isOrderMethod('point')).toBe(true);
    expect(isOrderMethod('qr')).toBe(true);
  });

  it('routes the cash family through plan checkout', () => {
    expect(isOrderMethod('efectivo')).toBe(false);
    expect(isOrderMethod('debito')).toBe(false);
    expect(isOrderMethod('credito')).toBe(false);
    expect(isOrderMethod('transferencia')).toBe(false);
  });
});

describe('summarizeCharge', () => {
  const plan = { id: 1, name: 'Full', price: 19995, maxClasses: 3 } as Plan;

  it('describes the plan and the term for a one-month charge', () => {
    expect(summarizeCharge(plan, 1, 19995, 'efectivo')).toEqual({
      plan,
      months: 1,
      amount: 19995,
      method: 'efectivo',
      termLabel: '1 mes',
    });
  });

  it('pluralizes a longer term', () => {
    expect(summarizeCharge(plan, 3, 50000, 'point').termLabel).toBe('3 meses');
  });
});

describe('defaultPlanIdFor', () => {
  it('defaults to the scheduled plan when the member has one pending', () => {
    expect(defaultPlanIdFor({ planId: 2, scheduledPlanId: 1 })).toBe(1);
  });

  it('falls back to the current plan when nothing is scheduled', () => {
    expect(defaultPlanIdFor({ planId: 2, scheduledPlanId: null })).toBe(2);
    expect(defaultPlanIdFor({ planId: 2 })).toBe(2);
  });

  it('is empty when the member has no active subscription at all', () => {
    expect(defaultPlanIdFor(null)).toBe('');
    expect(defaultPlanIdFor(undefined)).toBe('');
  });
});

describe('isPlanChangeCandidate', () => {
  it('is false when no plan is picked', () => {
    expect(isPlanChangeCandidate('', 2)).toBe(false);
  });

  it('is false when the picked plan is the member current one', () => {
    expect(isPlanChangeCandidate(2, 2)).toBe(false);
  });

  it('is false when the member has no current plan to compare against', () => {
    expect(isPlanChangeCandidate(2, null)).toBe(false);
  });

  it('is true when a different plan than the current one is picked', () => {
    expect(isPlanChangeCandidate(1, 2)).toBe(true);
  });
});

describe('amountForPlanChangeQuote', () => {
  const base: PlanChangeQuote = {
    planId: 5,
    planName: 'Plan Elite',
    eligible: true,
    reason: null,
    message: null,
    direction: 'upgrade',
    amount: 15000,
    daysRemaining: 12,
    effectiveEndDate: '2026-10-01',
  };

  it('does NOT pre-fill the prorated amount for an eligible upgrade — the front-desk write path has no proration support', () => {
    expect(amountForPlanChangeQuote(base)).toBeNull();
  });

  it('pre-fills zero for a downgrade — self-service never charges one', () => {
    expect(amountForPlanChangeQuote({ ...base, direction: 'downgrade' })).toBe(0);
  });

  it('pre-fills zero for a lateral move', () => {
    expect(amountForPlanChangeQuote({ ...base, direction: 'lateral' })).toBe(0);
  });

  it('pre-fills zero for an ineligible quote', () => {
    expect(
      amountForPlanChangeQuote({
        ...base,
        eligible: false,
        direction: null,
        reason: 'locked',
        message: 'Podés cambiar de plan a partir del 01/10/2026.',
        amount: 0,
      }),
    ).toBe(0);
  });
});
