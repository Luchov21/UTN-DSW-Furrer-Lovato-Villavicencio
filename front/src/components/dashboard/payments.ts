import type { Subscription } from '../../types/subscription';

export const RENEWAL_WINDOW_DAYS = 7;

// A member whose plan has lapsed, or is about to, needs one obvious way to
// pay — not a hunt through the plans page for the plan they already have.
export function needsRenewal(subscription: Subscription | null): boolean {
  if (!subscription?.endDate) return false;
  const state = (subscription.state ?? '').toLowerCase();
  if (state === 'vencida') return true;
  if (state !== 'activa') return false;

  const endDate = new Date(String(subscription.endDate).slice(0, 10));
  const daysLeft = Math.ceil(
    (endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  return daysLeft <= RENEWAL_WINDOW_DAYS;
}
