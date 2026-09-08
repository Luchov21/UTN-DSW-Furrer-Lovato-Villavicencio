import type { User } from './user';
import type { Plan } from './plan';

export interface Subscription {
  id?: number;
  userId: number;
  user?: User;
  planId: number;
  plan?: Plan;
  startDate: string;
  endDate: string;
  state?: string;
  autoRenew?: boolean;
  pausedAt?: string | null;
  deleted?: boolean;
  // Set by applyPlanChange for a downgrade: the plan the member moves to the
  // day after endDate. Cleared by cancelScheduledPlanChange.
  scheduledPlanId?: number | null;
}
