import { describe, expect, it } from 'vitest';
import { needsRenewal } from './payments';
import type { Subscription } from '../../types/subscription';

// Minimal fixture: only the fields needsRenewal reads.
const subscription = (overrides: Partial<Subscription>): Subscription => ({
  userId: 1,
  planId: 1,
  startDate: '2026-01-01',
  endDate: '2026-01-01',
  ...overrides,
});

describe('needsRenewal', () => {
  it('returns false for null', () => {
    expect(needsRenewal(null)).toBe(false);
  });

  it('returns false when endDate is missing', () => {
    expect(
      needsRenewal(subscription({ endDate: '', state: 'activa' })),
    ).toBe(false);
  });

  it('returns true when the state is vencida, regardless of endDate', () => {
    expect(
      needsRenewal(
        subscription({ state: 'vencida', endDate: '2020-01-01' }),
      ),
    ).toBe(true);
  });

  it('returns false for a state that is neither activa nor vencida', () => {
    expect(
      needsRenewal(subscription({ state: 'pausada', endDate: '2020-01-01' })),
    ).toBe(false);
  });

  it('returns false for an active plan ending well beyond the window', () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      needsRenewal(subscription({ state: 'activa', endDate: farFuture })),
    ).toBe(false);
  });

  it('returns true for an active plan ending within the renewal window', () => {
    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      needsRenewal(subscription({ state: 'activa', endDate: soon })),
    ).toBe(true);
  });

  it('returns true for an active plan that already ended', () => {
    expect(
      needsRenewal(subscription({ state: 'activa', endDate: '2020-01-01' })),
    ).toBe(true);
  });
});
