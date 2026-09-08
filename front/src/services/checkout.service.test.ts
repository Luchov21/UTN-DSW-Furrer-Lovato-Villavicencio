import { describe, expect, it } from 'vitest';
import { planChangeQuoteToSummary } from './checkout.service';
import type { PlanChangeQuote } from '../types/plan-change';

const eligibleQuote: PlanChangeQuote = {
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

describe('planChangeQuoteToSummary', () => {
  it('marks the result as a one-time adjustment, not a recurring price', () => {
    const summary = planChangeQuoteToSummary(eligibleQuote);
    expect(summary.isOneTimeAdjustment).toBe(true);
  });

  it('copies quote.amount verbatim into every price field — no recomputation', () => {
    const summary = planChangeQuoteToSummary(eligibleQuote);
    expect(summary.monthlyPrice).toBe(eligibleQuote.amount);
    expect(summary.subtotal).toBe(eligibleQuote.amount);
    expect(summary.total).toBe(eligibleQuote.amount);
  });

  it('throws the quote message for an ineligible change', () => {
    const ineligible: PlanChangeQuote = {
      ...eligibleQuote,
      eligible: false,
      message: 'Ya cambiaste de plan esta semana.',
    };
    expect(() => planChangeQuoteToSummary(ineligible)).toThrow(
      'Ya cambiaste de plan esta semana.',
    );
  });
});
