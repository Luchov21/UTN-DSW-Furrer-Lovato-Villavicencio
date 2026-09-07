// @vitest-environment jsdom
//
// render() needs a DOM; see PlanCard.test.tsx for why this is scoped per
// file rather than global.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import PaymentSuccess from './PaymentSuccess';
import type { CheckoutResult } from '../../types/checkout';

afterEach(() => {
  cleanup();
});

// Button renders a react-router Link when given an `href` (see
// "Ir a mi panel"/"Volver al inicio" below), which needs a Router context to
// mount at all — same reasoning as PlanCard.test.tsx.
const renderSuccess = (result: CheckoutResult) =>
  render(
    <MemoryRouter>
      <PaymentSuccess result={result} />
    </MemoryRouter>,
  );

const termResult: CheckoutResult = {
  status: 'approved',
  paymentId: 1,
  newEndDate: '2026-12-01',
  planName: 'Plan Premium',
  amount: 30000,
  months: 3,
};

describe('PaymentSuccess', () => {
  it('renders a term purchase duration as a month count', () => {
    renderSuccess(termResult);
    expect(screen.getByText('3 meses')).toBeTruthy();
  });

  it('renders a single-month term as "1 mes"', () => {
    renderSuccess({ ...termResult, months: 1 });
    expect(screen.getByText('1 mes')).toBeTruthy();
  });

  // Final-review Important finding: a prorated plan-change payment leaves
  // months undefined (the synchronous pay() path — dto.months is undefined
  // by design in plan-change mode) or 0 (the polled /checkout/status path —
  // ResolvedCharge's "no term" convention). Either used to render as a raw,
  // broken month count ("undefined meses" / "0 meses"); both must instead
  // read as a plan adjustment, matching OrderSummary's precedent.
  it('renders "Ajuste de plan" instead of "undefined meses" when months is undefined', () => {
    renderSuccess({ ...termResult, months: undefined });
    expect(screen.getByText('Ajuste de plan')).toBeTruthy();
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it('renders "Ajuste de plan" instead of "0 meses" when months is 0', () => {
    renderSuccess({ ...termResult, months: 0 });
    expect(screen.getByText('Ajuste de plan')).toBeTruthy();
    expect(screen.queryByText('0 meses')).toBeNull();
  });
});
