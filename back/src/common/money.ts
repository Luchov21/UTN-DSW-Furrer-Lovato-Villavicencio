// Rounds to 2 decimal places (currency). Plain float rounding has known edge
// cases, but this codebase doesn't use a decimal library anywhere else (money
// is stored as decimal(10,2) MySQL columns and read back as JS numbers), so
// none is introduced here just for this.
//
// Deliberately no Number.EPSILON (or similar) nudge before rounding: at the
// magnitudes this app actually handles (hundreds to hundreds of thousands of
// pesos) it is a no-op — verified against the exact 100.125 half-cent
// knife-edge, which rounds to 100.13 with or without it — and its only
// observable effect shows up at magnitude ~1, where it silently flips a
// genuine round-half-down case to round up.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
