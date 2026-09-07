// Mirrors back/src/modules/checkout/checkout.rules.ts and
// back/src/modules/subscription/plan-change.rules.ts.
import type { Subscription } from './subscription';

export type ChangeDirection = 'upgrade' | 'downgrade' | 'lateral';

export type BlockReason =
  | 'no_active_subscription'
  | 'not_current'
  | 'locked'
  | 'already_changed'
  | 'same_plan'
  | 'too_close_to_end';

// What GET /checkout/plan-change returns: the priced, member-specific quote
// for changing to `planId`.
export interface PlanChangeQuote {
  planId: number;
  planName: string;
  eligible: boolean;
  reason: BlockReason | null;
  /** Spanish, ready to render. Null when eligible. */
  message: string | null;
  direction: ChangeDirection | null;
  amount: number;
  daysRemaining: number;
  /** 'YYYY-MM-DD'. The end date the member keeps, or gets their change on. */
  effectiveEndDate: string | null;
}

// What PUT /subscription/me/plan-change returns for a free change (lateral or
// downgrade — an upgrade 409s here and must go through checkout instead).
// Mirrors subscriptionService.applyPlanChange's return value; there is no
// named backend type for it.
export interface PlanChangeResult {
  direction: ChangeDirection;
  /** 'YYYY-MM-DD'. */
  effectiveFrom: string;
  subscription: Subscription;
}
