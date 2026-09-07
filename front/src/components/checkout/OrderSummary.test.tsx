// @vitest-environment jsdom
//
// render() needs a DOM; see PlanCard.test.tsx for why this is scoped per
// file rather than global.
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import OrderSummary from './OrderSummary';
import type { CheckoutSummary } from '../../types/checkout';

afterEach(() => {
  cleanup();
});

const termSummary: CheckoutSummary = {
  planId: 1,
  planName: 'Plan Premium',
  months: 3,
  monthlyPrice: 10000,
  subtotal: 30000,
  discount: 0,
  total: 30000,
  currency: 'ARS',
  availableMonths: [1, 3, 6, 12],
};

// Same amount as above, but shaped the way planChangeQuoteToSummary adapts a
// PlanChangeQuote: a one-time proration top-up, not a recurring price.
const planChangeSummary: CheckoutSummary = {
  planId: 2,
  planName: 'Plan Elite',
  months: 1,
  monthlyPrice: 15000,
  subtotal: 15000,
  discount: 0,
  total: 15000,
  currency: 'ARS',
  availableMonths: [],
  isOneTimeAdjustment: true,
};

describe('OrderSummary', () => {
  it('renders a term purchase as a recurring monthly price', () => {
    render(<OrderSummary summary={termSummary} />);
    expect(screen.getByText('$10.000 / mes')).toBeTruthy();
    expect(screen.getByText(/Subtotal \(3 × \$10\.000\)/)).toBeTruthy();
  });

  // The finding this guards against: quote.amount is a one-time proration
  // top-up (see planChangeQuoteToSummary), not the member's new recurring
  // price. Rendering it as "$X / mes" or "Subtotal (1 × $X)" would read as
  // their monthly bill having changed, which it hasn't.
  it('renders a plan-change adjustment as a one-time charge, never as a monthly price', () => {
    render(<OrderSummary summary={planChangeSummary} />);
    expect(screen.queryByText(/\/ mes/)).toBeNull();
    expect(screen.queryByText(/Subtotal/)).toBeNull();
    expect(screen.getByText('Ajuste único')).toBeTruthy();
    expect(screen.getByText('Diferencia a pagar')).toBeTruthy();
    // The amount itself is untouched — this is a relabel, not a recompute.
    expect(screen.getAllByText('$15.000').length).toBeGreaterThan(0);
  });
});
