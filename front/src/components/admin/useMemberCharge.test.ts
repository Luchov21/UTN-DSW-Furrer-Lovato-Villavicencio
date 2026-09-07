// @vitest-environment jsdom
//
// renderHook needs a DOM — see usePlanChangeQuotes.test.ts for the same
// per-file environment override.
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMemberCharge } from './useMemberCharge';
import * as planService from '../../services/plan.service';
import * as subscriptionService from '../../services/subscription.service';
import * as paymentService from '../../services/payment.service';
import * as checkoutService from '../../services/checkout.service';
import type { Plan } from '../../types/plan';
import type { Subscription } from '../../types/subscription';
import type { PlanChangeQuote } from '../../types/plan-change';
import type { User } from '../../types/user';

// Round-1 review regression (task-14-report.md): applyPlanChange only ever
// sets scheduledPlanId for a downgrade, so every auto-selected
// (untouched-picker) scheduled-plan case is, by construction, a downgrade —
// assessChange always quotes it as amount: 0, often with eligible: false
// (too_close_to_end) as well, since it's exactly the "walking in to renew at
// or after term end" case. Before the fix, the quote effect's .then()
// unconditionally overwrote amountText with that 0, clobbering the
// synchronous resolvedPrice effect's correct list-price value on every
// routine renewal.

const BASICO: Plan = { id: 1, name: 'Basico', price: 10000, numDays: 30 };
const PREMIUM: Plan = { id: 2, name: 'Premium', price: 15000, numDays: 30 };
const ELITE: Plan = { id: 3, name: 'Elite', price: 30000, numDays: 30 };

const MEMBER: User = {
  id: 42,
  dni: 12345678,
  email: 'member@example.com',
  name: 'Member',
  surname: 'Uno',
  phone: '111',
  role: 'user',
};

const activeSubscription = (
  overrides: Partial<Subscription> = {},
): Subscription => ({
  id: 1,
  userId: MEMBER.id,
  planId: PREMIUM.id!,
  startDate: '2026-01-01',
  endDate: '2026-09-10',
  state: 'activa',
  ...overrides,
});

const downgradeQuote = (planId: number): PlanChangeQuote => ({
  planId,
  planName: BASICO.name,
  eligible: false,
  reason: 'too_close_to_end',
  message: 'Faltan menos de 7 días para el fin del período actual.',
  direction: 'downgrade',
  amount: 0,
  daysRemaining: 2,
  effectiveEndDate: null,
});

const upgradeQuote = (planId: number): PlanChangeQuote => ({
  planId,
  planName: ELITE.name,
  eligible: true,
  reason: null,
  message: null,
  direction: 'upgrade',
  amount: 5000,
  daysRemaining: 2,
  effectiveEndDate: '2026-09-10',
});

describe('useMemberCharge — plan-change quote vs. amountText', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not let an auto-selected scheduled downgrade zero out the routine-renewal amount', async () => {
    // The member self-scheduled a downgrade from Premium to Basico; the
    // picker auto-selects Basico (defaultPlanIdFor), which is by
    // construction a downgrade away from currentPlanId (Premium) — the
    // quote effect fires with no admin interaction at all.
    vi.spyOn(planService, 'getPlans').mockResolvedValue([BASICO, PREMIUM, ELITE]);
    vi.spyOn(planService, 'getPlanDurations').mockResolvedValue([]);
    vi.spyOn(subscriptionService, 'getSubscriptionsByUser').mockResolvedValue([
      activeSubscription({ scheduledPlanId: BASICO.id }),
    ]);
    vi.spyOn(paymentService, 'getPaymentsByUser').mockResolvedValue([]);
    vi.spyOn(checkoutService, 'getPlanChangeQuoteForMember').mockResolvedValue(
      downgradeQuote(BASICO.id!),
    );

    const { result } = renderHook(() => useMemberCharge(MEMBER));

    // Sanity: the picker really did auto-select the scheduled (cheaper) plan.
    await waitFor(() => expect(result.current.planId).toBe(BASICO.id));

    // Let the quote resolve too, and confirm it did (proving this isn't
    // passing merely because the quote never arrived).
    await waitFor(() => expect(result.current.quote).not.toBeNull());
    expect(result.current.quote?.amount).toBe(0);

    // The amount must still be Basico's own list price, not the quote's 0.
    expect(result.current.amountText).toBe('10.000');
  });

  it('still pre-fills the quoted amount when the admin manually picks a different plan (upgrade)', async () => {
    vi.spyOn(planService, 'getPlans').mockResolvedValue([BASICO, PREMIUM, ELITE]);
    vi.spyOn(planService, 'getPlanDurations').mockResolvedValue([]);
    vi.spyOn(subscriptionService, 'getSubscriptionsByUser').mockResolvedValue([
      activeSubscription(),
    ]);
    vi.spyOn(paymentService, 'getPaymentsByUser').mockResolvedValue([]);
    vi.spyOn(checkoutService, 'getPlanChangeQuoteForMember').mockResolvedValue(
      upgradeQuote(ELITE.id!),
    );

    const { result } = renderHook(() => useMemberCharge(MEMBER));

    await waitFor(() => expect(result.current.planId).toBe(PREMIUM.id));
    // The member's own current plan resolved first — its list price shows,
    // same as pre-Task-14 behavior for an untouched selection.
    expect(result.current.amountText).toBe('15.000');

    // The admin manually picks Elite (an upgrade) at the counter.
    act(() => {
      result.current.setPlanId(ELITE.id!);
    });

    await waitFor(() => expect(result.current.quote?.planId).toBe(ELITE.id));
    // Unaffected by the fix: a manually-picked plan still gets the quoted,
    // prorated amount, not the plan's own list price.
    expect(result.current.amountText).toBe('5.000');
  });

  it('still pre-fills 0 when the admin manually picks a downgrade/lateral plan', async () => {
    vi.spyOn(planService, 'getPlans').mockResolvedValue([BASICO, PREMIUM, ELITE]);
    vi.spyOn(planService, 'getPlanDurations').mockResolvedValue([]);
    vi.spyOn(subscriptionService, 'getSubscriptionsByUser').mockResolvedValue([
      activeSubscription({ planId: ELITE.id! }),
    ]);
    vi.spyOn(paymentService, 'getPaymentsByUser').mockResolvedValue([]);
    vi.spyOn(checkoutService, 'getPlanChangeQuoteForMember').mockResolvedValue(
      downgradeQuote(BASICO.id!),
    );

    const { result } = renderHook(() => useMemberCharge(MEMBER));

    await waitFor(() => expect(result.current.planId).toBe(ELITE.id));
    expect(result.current.amountText).toBe('30.000');

    // The admin manually picks Basico (a downgrade) at the counter.
    act(() => {
      result.current.setPlanId(BASICO.id!);
    });

    await waitFor(() => expect(result.current.quote?.planId).toBe(BASICO.id));
    // A manually-picked downgrade is still correctly quoted to 0 — proving
    // the gate only suppresses the auto-selected path, not this one.
    expect(result.current.amountText).toBe('0');
  });
});
