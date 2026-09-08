import { describe, expect, it } from 'vitest';
import {
  checkoutWalletUrl,
  readCheckoutParams,
  safeReturnTo,
} from './useCheckoutParams';

describe('readCheckoutParams', () => {
  it('reads a plan and a term', () => {
    expect(readCheckoutParams('?plan=12&months=6')).toEqual({
      planId: 12,
      months: 6,
      mode: 'term',
    });
  });

  it('defaults to one month', () => {
    expect(readCheckoutParams('?plan=12')).toEqual({
      planId: 12,
      months: 1,
      mode: 'term',
    });
  });

  it('rejects a non-numeric plan', () => {
    expect(readCheckoutParams('?plan=abc').planId).toBeNull();
  });

  it('rejects a term the backend would refuse', () => {
    expect(readCheckoutParams('?plan=12&months=5').months).toBe(1);
  });

  it('reads plan-change mode from the query string', () => {
    expect(readCheckoutParams('?plan=12&mode=plan-change')).toEqual({
      planId: 12,
      months: 1,
      mode: 'plan-change',
    });
  });

  it('falls back to a term purchase for any other mode', () => {
    expect(readCheckoutParams('?plan=12&mode=nonsense').mode).toBe('term');
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

describe('checkoutWalletUrl', () => {
  it('carries the plan and the term', () => {
    expect(checkoutWalletUrl(12, 6)).toBe('/checkout/wallet?plan=12&months=6');
  });

  it('renders a missing plan as an empty parameter rather than "null"', () => {
    expect(checkoutWalletUrl(null, 1)).toBe('/checkout/wallet?plan=&months=1');
  });

  it('omits mode for a term purchase', () => {
    expect(checkoutWalletUrl(12, 6, 'term')).toBe(
      '/checkout/wallet?plan=12&months=6',
    );
  });

  it('carries plan-change mode', () => {
    expect(checkoutWalletUrl(12, 1, 'plan-change')).toBe(
      '/checkout/wallet?plan=12&months=1&mode=plan-change',
    );
  });
});
