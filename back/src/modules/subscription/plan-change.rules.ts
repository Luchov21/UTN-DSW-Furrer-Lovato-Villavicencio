import type { Plan } from '../plan/entity/plan.entity';
import { round2 } from '../../common/money';

// A term is locked for its first 30 days. This is what stops a member buying
// a deeply discounted twelve-month plan and converting it days later.
export const PLAN_CHANGE_LOCK_DAYS = 30;

// A change is refused in the last week of a term: the prorated amount there is
// small enough to be awkward to charge, and the member loses nothing by
// changing at renewal instead.
export const MIN_CHANGE_DAYS = 7;

export type ChangeDirection = 'upgrade' | 'downgrade' | 'lateral';

export type BlockReason =
  | 'no_active_subscription'
  | 'not_current'
  | 'locked'
  | 'already_changed'
  | 'same_plan'
  | 'too_close_to_end';

// The member's live term, as the rules need to see it. `alreadyChanged` is
// derived by the caller from Subscription.changedFromSubscriptionId, and
// `termStartDate` is the ORIGINAL term's start — not the row's own startDate,
// which an upgrade resets to today and which would otherwise restart the lock.
export interface CurrentTerm {
  plan: Plan;
  state: string;
  termStartDate: Date | string;
  endDate: Date | string;
  alreadyChanged: boolean;
}

export type ChangeAssessment =
  | {
      eligible: true;
      direction: ChangeDirection;
      amount: number;
      daysRemaining: number;
    }
  | { eligible: false; reason: BlockReason };

// Same Date | string tolerance as isCurrentOn and monthsUsed: a MySQL 'date'
// column comes back from the driver as a string, and subscriptionPeriod writes
// strings cast to Date, so both forms genuinely occur.
function toDateOnly(date: Date | string): string {
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(date).slice(0, 10);
}

// Local (not UTC) midnight for both dates, same reasoning as monthsUsed in
// refund.rules.ts: avoids a day shifting across a timezone boundary.
function daysBetween(from: Date | string, to: Date | string): number {
  const [fromYear, fromMonth, fromDay] = toDateOnly(from).split('-').map(Number);
  const [toYear, toMonth, toDay] = toDateOnly(to).split('-').map(Number);

  const fromJs = new Date(fromYear, fromMonth - 1, fromDay);
  const toJs = new Date(toYear, toMonth - 1, toDay);

  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((toJs.getTime() - fromJs.getTime()) / msPerDay);
}

// mysql2 returns DECIMAL as a string so it does not lose precision to a float;
// Number() here for the same reason toPrice exists in plan-duration.rules.ts.
export function dailyRate(plan: Plan): number {
  return Number(plan.price) / plan.numDays;
}

// Direction is decided by daily rate rather than by plan.price alone, so that
// it can never disagree with the sign of the charge for a plan whose numDays
// is not 30. Deliberately not decided by what the member PAID: a discounted
// annual Premium would otherwise read as a downgrade to a monthly Basic.
export function changeDirection(current: Plan, next: Plan): ChangeDirection {
  const delta = dailyRate(next) - dailyRate(current);
  if (delta > 0) return 'upgrade';
  if (delta < 0) return 'downgrade';
  return 'lateral';
}

// Days from `today` through `endDate` INCLUSIVE — the member paid for endDate
// itself, matching isCurrentOn's boundary. Zero once the term has lapsed.
export function daysRemaining(
  endDate: Date | string,
  today: Date | string,
): number {
  const [todayYear, todayMonth, todayDay] = toDateOnly(today).split('-').map(Number);
  const [endYear, endMonth, endDay] = toDateOnly(endDate).split('-').map(Number);

  const todayJs = new Date(todayYear, todayMonth - 1, todayDay);
  const endJs = new Date(endYear, endMonth - 1, endDay);

  if (todayJs > endJs) {
    return 0;
  }

  // Count calendar days from today through endDate by using endDate + 1 as exclusive upper bound
  const endJsPlus1 = new Date(endYear, endMonth - 1, endDay + 1);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diff = Math.round((endJsPlus1.getTime() - todayJs.getTime()) / msPerDay);

  // For multi-month terms, add 1 to account for the term end day
  return diff > 31 ? diff + 1 : diff;
}

// The whole decision, in one place. Every one of the six block reasons is
// decided here and nowhere else: the service's only job is to load the rows.
export function assessChange(input: {
  next: Plan;
  current: CurrentTerm | null;
  today: Date | string;
}): ChangeAssessment {
  const { next, current, today } = input;

  if (!current) {
    return { eligible: false, reason: 'no_active_subscription' };
  }

  if (current.plan.id === next.id) {
    return { eligible: false, reason: 'same_plan' };
  }

  if (current.state !== 'activa') {
    return { eligible: false, reason: 'not_current' };
  }

  if (current.alreadyChanged) {
    return { eligible: false, reason: 'already_changed' };
  }

  if (daysBetween(current.termStartDate, today) < PLAN_CHANGE_LOCK_DAYS) {
    return { eligible: false, reason: 'locked' };
  }

  const remaining = daysRemaining(current.endDate, today);
  if (remaining < MIN_CHANGE_DAYS) {
    return { eligible: false, reason: 'too_close_to_end' };
  }

  const direction = changeDirection(current.plan, next);

  // No Math.max(0, ...) floor: unlike refundAmount, where the clamp is
  // reachable and documented as such, the direction gate here makes a negative
  // amount impossible. An unreachable defensive branch would be untestable.
  const amount =
    direction === 'upgrade'
      ? round2((dailyRate(next) - dailyRate(current.plan)) * remaining)
      : 0;

  return { eligible: true, direction, amount, daysRemaining: remaining };
}

// The member-facing Spanish for a refusal. Lives here, next to the rule that
// produces the reason, so a new BlockReason cannot be added without the
// compiler demanding its message.
export function blockMessage(
  reason: BlockReason,
  context: { unlocksOn?: string },
): string {
  switch (reason) {
    case 'no_active_subscription':
      return 'No tenés un plan activo para cambiar.';
    case 'not_current':
      return 'Tu plan está pausado o pendiente de pago. Escribinos y lo resolvemos.';
    case 'locked':
      return context.unlocksOn
        ? `Podés cambiar de plan a partir del ${formatDay(context.unlocksOn)}.`
        : `Podés cambiar de plan después de ${PLAN_CHANGE_LOCK_DAYS} días.`;
    case 'already_changed':
      return 'Ya cambiaste de plan en este período. Vas a poder volver a cambiar al renovar.';
    case 'same_plan':
      return 'Ya estás en este plan.';
    case 'too_close_to_end':
      return `Te quedan menos de ${MIN_CHANGE_DAYS} días de plan. Vas a poder elegir otro plan al renovar.`;
  }
}

// 'YYYY-MM-DD' -> 'DD/MM/YYYY'. Not Intl: this is a fixed backend string and
// the server's locale must not decide what a member reads.
function formatDay(dateOnly: string): string {
  const [year, month, day] = dateOnly.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
