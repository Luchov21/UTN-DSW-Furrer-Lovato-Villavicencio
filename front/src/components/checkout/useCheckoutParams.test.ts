import { describe, expect, it } from 'vitest';
import { readCheckoutParams, safeReturnTo } from './useCheckoutParams';

describe('readCheckoutParams', () => {
  it('reads a plan and a term', () => {
    expect(readCheckoutParams('?plan=12&months=6')).toEqual({
      planId: 12,
      months: 6,
    });
  });

  it('defaults to one month', () => {
    expect(readCheckoutParams('?plan=12')).toEqual({ planId: 12, months: 1 });
  });

  it('rejects a non-numeric plan', () => {
    expect(readCheckoutParams('?plan=abc').planId).toBeNull();
  });

  it('rejects a term the backend would refuse', () => {
    expect(readCheckoutParams('?plan=12&months=5').months).toBe(1);
  });
});

describe('safeReturnTo', () => {
  it('keeps a relative path', () => {
    expect(safeReturnTo('/checkout/wallet?plan=12')).toBe(
      '/checkout/wallet?plan=12',
    );
  });

  it('refuses an absolute URL', () => {
    expect(safeReturnTo('https://evil.example/steal')).toBe('/dashboard');
  });

  it('refuses a protocol-relative URL', () => {
    expect(safeReturnTo('//evil.example/steal')).toBe('/dashboard');
  });

  it('falls back when there is nothing', () => {
    expect(safeReturnTo(null)).toBe('/dashboard');
  });
});
