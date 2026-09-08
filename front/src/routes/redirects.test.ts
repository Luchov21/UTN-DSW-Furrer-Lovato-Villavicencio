import { describe, it, expect } from 'vitest';
import { returnPathFrom, completeProfileUrl } from './redirects';
import { safeReturnTo } from '../components/checkout/useCheckoutParams';

describe('returnPathFrom', () => {
  it('keeps the query string a checkout link carries', () => {
    // The plan and the term live only here. Returning '/checkout/wallet'
    // alone lands the member on a page with nothing to sell.
    expect(
      returnPathFrom({ pathname: '/checkout/wallet', search: '?plan=12&months=6' }),
    ).toBe('/checkout/wallet?plan=12&months=6');
  });

  it('returns the bare pathname when there is no query string', () => {
    expect(returnPathFrom({ pathname: '/dashboard', search: '' })).toBe(
      '/dashboard',
    );
  });

  it('falls back to the home page with no origin to return to', () => {
    expect(returnPathFrom(null)).toBe('/');
    expect(returnPathFrom(undefined)).toBe('/');
    expect(returnPathFrom({})).toBe('/');
  });
});

describe('completeProfileUrl', () => {
  it('carries the whole location, query string included', () => {
    expect(
      completeProfileUrl({
        pathname: '/checkout/wallet',
        search: '?plan=12&months=6',
      }),
    ).toBe(
      '/complete-profile?returnTo=%2Fcheckout%2Fwallet%3Fplan%3D12%26months%3D6',
    );
  });

  it('round-trips through safeReturnTo back to the same page', () => {
    // What CompleteProfile.tsx actually does with it: read the param (which
    // decodes it) and hand it to safeReturnTo. A returnTo that does not
    // survive this trip sends the member to /dashboard instead.
    const url = completeProfileUrl({
      pathname: '/checkout/wallet',
      search: '?plan=12&months=6',
    });
    const param = new URLSearchParams(url.split('?')[1]).get('returnTo');

    expect(safeReturnTo(param)).toBe('/checkout/wallet?plan=12&months=6');
  });
});
