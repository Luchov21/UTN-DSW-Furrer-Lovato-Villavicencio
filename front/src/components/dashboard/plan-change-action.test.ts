import { describe, expect, it } from 'vitest';
import { resolvePlanChangeAction } from './plan-change-action';
import type { PlanChangeQuote } from '../../types/plan-change';

describe('resolvePlanChangeAction', () => {
  it('sends a member with no subscription to the plain checkout, not applyPlanChange', () => {
    expect(resolvePlanChangeAction(3, false, undefined)).toEqual({
      type: 'checkout',
      url: '/checkout?plan=3&months=1',
    });
  });

  it('sends an upgrade to checkout in plan-change mode, not applyPlanChange', () => {
    const quote = { direction: 'upgrade' } as PlanChangeQuote;
    expect(resolvePlanChangeAction(3, true, quote)).toEqual({
      type: 'checkout',
      url: '/checkout?plan=3&mode=plan-change',
    });
  });

  it('applies a downgrade directly instead of navigating to checkout', () => {
    const quote = { direction: 'downgrade' } as PlanChangeQuote;
    expect(resolvePlanChangeAction(3, true, quote)).toEqual({ type: 'apply' });
  });

  it('applies a lateral move directly instead of navigating to checkout', () => {
    const quote = { direction: 'lateral' } as PlanChangeQuote;
    expect(resolvePlanChangeAction(3, true, quote)).toEqual({ type: 'apply' });
  });

  it('applies when there is a subscription but no quote yet', () => {
    // Defensive: quotes load asynchronously (usePlanChangeQuotes), so a click
    // that lands before the quote resolves must not be misread as an upgrade.
    expect(resolvePlanChangeAction(3, true, undefined)).toEqual({
      type: 'apply',
    });
  });
});
