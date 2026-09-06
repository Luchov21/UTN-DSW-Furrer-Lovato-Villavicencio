import { round2 } from './money';

describe('round2', () => {
  it('rounds to two decimals', () => {
    expect(round2(100.126)).toBe(100.13);
    expect(round2(100.124)).toBe(100.12);
  });

  it('leaves an exact two-decimal value alone', () => {
    expect(round2(4200.5)).toBe(4200.5);
  });

  it('rounds a repeating division, which is why this exists', () => {
    // 8000 / 30 * 7 — a prorated upgrade amount. Without rounding this is
    // 1866.6666666666667 and cannot reach a decimal(10,2) column intact.
    expect(round2((8000 / 30) * 7)).toBe(1866.67);
  });
});
