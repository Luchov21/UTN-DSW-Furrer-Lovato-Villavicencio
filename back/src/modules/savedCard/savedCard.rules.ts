/**
 * The subset of SavedCard fields isChargeable needs. Kept narrower than the
 * entity itself so this pure function can be tested (and called) with plain
 * object literals, no repository or entity instance required.
 */
export interface ChargeableCard {
  active: boolean;
  deleted: boolean;
  expirationMonth: number;
  expirationYear: number;
  /**
   * `credit_card` / `debit_card`, as Mercado Pago's Orders API requires it
   * explicitly for every card charge. `null` on a card saved before this
   * field existed — such a card cannot be charged until the member re-saves
   * it, rather than guessing at a type that might be wrong.
   */
  paymentTypeId: string | null;
}

/**
 * Whether a saved card can be charged right now: active, not (soft-)deleted,
 * and not past its expiry month.
 *
 * The expiry check is inclusive of the whole expiration month — a card
 * expiring 08/2026 is good for all of August, through the 31st. Comparing
 * against the first-of-next-month boundary (rather than, say, the 1st of the
 * expiry month itself) is what makes that inclusive: `today < firstOfNextMonth`
 * is true for every day up to and including the last day of the expiry month,
 * and false from the 1st of the following month on.
 */
export function isChargeable(card: ChargeableCard, today: Date): boolean {
  if (!card.active || card.deleted || !card.paymentTypeId) {
    return false;
  }

  // expirationMonth is 1-indexed (1 = January, 12 = December); the Date
  // constructor's month argument is 0-indexed, so passing expirationMonth
  // unadjusted already lands on the first day of the month AFTER expiry.
  const firstOfNextMonth = new Date(
    card.expirationYear,
    card.expirationMonth,
    1,
  );

  return today.getTime() < firstOfNextMonth.getTime();
}
