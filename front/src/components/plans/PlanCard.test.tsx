// @vitest-environment jsdom
//
// renderHook/render need a DOM; every other test in this project checks pure
// functions under vitest's default 'node' environment (see
// usePlanChangeQuotes.test.ts), so this is scoped to this file rather than
// switched on globally in vite.config.ts.
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import PlanCard from './PlanCard';
import type { MembershipPlan } from './plans.data';
import type { PlanChangeQuote } from '../../types/plan-change';

// This project's vitest setup has no global afterEach cleanup (no jsdom
// testing-library auto-registration outside jest), so each render is
// unmounted explicitly — otherwise the second test's screen query would see
// both renders' buttons at once.
afterEach(() => {
  cleanup();
});

const basePlan: MembershipPlan = {
  id: 1,
  name: 'Plan Básico',
  description: '',
  price: '$10.000',
  numericPrice: 10000,
  period: '/mes',
  numDays: 30,
  highlight: false,
  features: [],
  maxClasses: 0,
};

// Button renders a native <button>, so its `disabled` attribute reflects
// straight onto the DOM node — no jest-dom matcher needed. PlanCard always
// renders exactly one button, so a plain role query finds it regardless of
// which label (Elegir plan / Procesando... / Plan actual) it currently shows.
const selectButton = () => screen.getByRole('button') as HTMLButtonElement;

describe('PlanCard select button', () => {
  it('is not disabled when there is no quote yet', () => {
    render(
      <MemoryRouter>
        <PlanCard plan={basePlan} />
      </MemoryRouter>,
    );
    expect(selectButton().disabled).toBe(false);
  });

  it('is not disabled when the quote is eligible', () => {
    const quote = { eligible: true, direction: 'lateral' } as PlanChangeQuote;
    render(
      <MemoryRouter>
        <PlanCard plan={basePlan} quote={quote} />
      </MemoryRouter>,
    );
    expect(selectButton().disabled).toBe(false);
  });

  it('is disabled when the quote is ineligible', () => {
    const quote = {
      eligible: false,
      direction: null,
      message: 'Ya cambiaste de plan hoy.',
    } as PlanChangeQuote;
    render(
      <MemoryRouter>
        <PlanCard plan={basePlan} quote={quote} />
      </MemoryRouter>,
    );
    expect(selectButton().disabled).toBe(true);
  });

  it('keeps the pre-existing isLoading disable reason', () => {
    render(
      <MemoryRouter>
        <PlanCard plan={basePlan} isLoading />
      </MemoryRouter>,
    );
    expect(selectButton().disabled).toBe(true);
  });

  it('keeps the pre-existing isCurrentSubscription disable reason', () => {
    render(
      <MemoryRouter>
        <PlanCard plan={basePlan} isCurrentSubscription />
      </MemoryRouter>,
    );
    // isCurrentSubscription swaps the label to "Plan actual".
    expect(screen.getByText('Plan actual')).toBeTruthy();
    expect(selectButton().disabled).toBe(true);
  });
});
