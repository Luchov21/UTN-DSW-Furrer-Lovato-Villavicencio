// @vitest-environment jsdom
//
// renderHook needs a DOM; every other test in this project checks pure
// functions under vitest's default 'node' environment, so this is scoped to
// this file rather than switched on globally in vite.config.ts.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePlanChangeQuotes } from './usePlanChangeQuotes';
import * as checkoutService from '../../services/checkout.service';

describe('usePlanChangeQuotes', () => {
  // Nothing in this project's vitest setup restores spies automatically
  // (no `restoreMocks` config, no other spec spies on a module yet), so a
  // `vi.spyOn` from one test would otherwise keep recording calls in the
  // next one.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks for one quote per plan and keys them by plan id', async () => {
    vi.spyOn(checkoutService, 'getPlanChangeQuote').mockImplementation(
      async (planId) => ({ planId, eligible: true, amount: planId * 100 }) as never,
    );

    const { result } = renderHook(() =>
      usePlanChangeQuotes([{ id: 1 }, { id: 2 }] as never, true),
    );

    await waitFor(() => expect(result.current.quotes[2]?.amount).toBe(200));
  });

  it('asks for nothing when the member has no subscription', async () => {
    // Every quote would come back 'no_active_subscription'; the plans page
    // shows plain prices instead, and two requests are two wasted round trips.
    const spy = vi.spyOn(checkoutService, 'getPlanChangeQuote');

    renderHook(() => usePlanChangeQuotes([{ id: 1 }] as never, false));

    await waitFor(() => expect(spy).not.toHaveBeenCalled());
  });

  it('leaves the other quotes usable when one request fails', async () => {
    vi.spyOn(checkoutService, 'getPlanChangeQuote').mockImplementation(
      async (planId) =>
        planId === 1 ? Promise.reject(new Error('boom')) : ({ planId, eligible: true, amount: 0 } as never),
    );

    const { result } = renderHook(() =>
      usePlanChangeQuotes([{ id: 1 }, { id: 2 }] as never, true),
    );

    await waitFor(() => expect(result.current.quotes[2]).toBeDefined());
    expect(result.current.quotes[1]).toBeUndefined();
  });
});
