import { round2 } from '../../common/money';

// Refund policy: a started billing period counts as fully used. This is a
// deliberate business rule — it favours the gym and matches how memberships
// are normally billed (you don't get a partial-month discount for cancelling
// mid-period). REFUND_ROUNDS_UP is not branched on anywhere below; there is
// only one policy implemented. It exists purely so the rule is discoverable
// and greppable rather than buried inside a Math.ceil call.
export const REFUND_ROUNDS_UP = true;

// How many billing periods of `numDays` have started between `startDate` and
// `today` (both 'YYYY-MM-DD', or Date — same Date | string tolerance as
// isCurrentOn in subscription.rules.ts). Rounds UP (Math.ceil): see
// REFUND_ROUNDS_UP above — a started period counts as fully used, so day 1 of
// month 2 already counts as 2 months used, not 1.
export function monthsUsed(
  startDate: Date | string,
  today: Date | string,
  numDays: number,
): number {
  const start = toDateOnly(startDate);
  const current = toDateOnly(today);

  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [curYear, curMonth, curDay] = current.split('-').map(Number);

  // Local (not UTC) midnight for both dates, same reasoning as
  // subscription.rules.ts: avoids a day shifting across a timezone boundary.
  const startJs = new Date(startYear, startMonth - 1, startDay);
  const curJs = new Date(curYear, curMonth - 1, curDay);

  const msPerDay = 24 * 60 * 60 * 1000;
  const daysElapsed = Math.round(
    (curJs.getTime() - startJs.getTime()) / msPerDay,
  );

  if (daysElapsed <= 0) return 0;
  return Math.ceil(daysElapsed / numDays);
}

// Same 'YYYY-MM-DD' normalisation isCurrentOn/renewalPeriod use in
// subscription.rules.ts: a MySQL 'date' column comes back from the driver as
// a string, and callers also pass a plain Date, so both forms are accepted.
function toDateOnly(date: Date | string): string {
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(date).slice(0, 10);
}

export interface RefundAmountInput {
  totalPaid: number;
  monthsUsed: number;
  regularMonthlyPrice: number;
}

// What is owed back: what was paid, minus the months already used charged at
// the *regular* (non-discounted) monthly rate — the discount is not honoured
// on months already consumed.
//
// Math.max(0, …) is reachable, not defensive padding: a member who bought a
// deeply-discounted annual term and cancels near the end will have consumed
// more value, at the regular monthly rate, than they ever paid. The gym does
// not then invoice the member for the difference — it simply refunds zero.
export function refundAmount({
  totalPaid,
  monthsUsed,
  regularMonthlyPrice,
}: RefundAmountInput): number {
  return Math.max(0, round2(totalPaid - monthsUsed * regularMonthlyPrice));
}
