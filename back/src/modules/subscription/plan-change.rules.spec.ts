import type { Plan } from '../plan/entity/plan.entity';
import {
  assessChange,
  changeDirection,
  dailyRate,
  daysRemaining,
  MIN_CHANGE_DAYS,
  PLAN_CHANGE_LOCK_DAYS,
} from './plan-change.rules';

// Only the four fields the rules read. Cast rather than build a full entity:
// these functions must not grow a dependency on anything else on Plan.
const plan = (id: number, price: number, numDays = 30): Plan =>
  ({ id, price, numDays, name: `Plan ${id}` }) as Plan;

const basic = plan(1, 6000);
const premium = plan(2, 9000);
const elite = plan(3, 15000);

describe('dailyRate', () => {
  it('divides the monthly price by the plan period', () => {
    expect(dailyRate(basic)).toBe(200);
  });

  it('uses the plan period, not a hard-coded 30', () => {
    // A 45-day plan at 9000 is 200/day, the same as a 30-day plan at 6000.
    // Comparing monthly prices alone would call this an upgrade; it is not.
    expect(dailyRate(plan(9, 9000, 45))).toBe(200);
  });
});

describe('changeDirection', () => {
  it('calls a dearer daily rate an upgrade', () => {
    expect(changeDirection(basic, premium)).toBe('upgrade');
  });

  it('calls a cheaper daily rate a downgrade', () => {
    expect(changeDirection(premium, basic)).toBe('downgrade');
  });

  it('calls an equal daily rate lateral, across different periods', () => {
    expect(changeDirection(basic, plan(9, 9000, 45))).toBe('lateral');
  });
});

describe('daysRemaining', () => {
  it('counts the end date itself, which the member paid for', () => {
    expect(daysRemaining('2026-01-31', '2026-01-31')).toBe(1);
  });

  it('counts today through the end date inclusive', () => {
    expect(daysRemaining('2026-01-31', '2026-01-30')).toBe(2);
    expect(daysRemaining('2026-01-31', '2026-01-01')).toBe(31);
  });

  it('returns zero once the term has lapsed', () => {
    expect(daysRemaining('2026-01-31', '2026-02-01')).toBe(0);
  });

  it('accepts a Date as well as a string, as the driver returns both', () => {
    expect(daysRemaining(new Date(2026, 0, 31), '2026-01-30')).toBe(2);
  });
});

describe('assessChange', () => {
  // 30 days into a 90-day term: past the lock, 60 days still to run.
  const current = {
    plan: basic,
    state: 'activa',
    termStartDate: '2026-01-01',
    endDate: '2026-03-31',
    alreadyChanged: false,
  };
  const today = '2026-01-31';

  it('prices an upgrade as the daily difference over the days remaining', () => {
    // (300 - 200) * 60 = 6000. The member keeps 31/03 as their end date and
    // pays 6000, not premium's full 9000.
    const result = assessChange({ next: premium, current, today });

    expect(result).toEqual({
      eligible: true,
      direction: 'upgrade',
      amount: 6000,
      daysRemaining: 60,
    });
  });

  it('rounds a repeating difference to two decimals', () => {
    // (15000/30 - 6000/30) * 61 = 300 * 61 exactly; use a 7-day tail instead
    // to force the repeating case through round2.
    const result = assessChange({
      next: plan(4, 8000),
      current: { ...current, endDate: '2026-02-06' },
      today: '2026-01-31',
    });

    // (8000/30 - 6000/30) * 7 = 466.6666... -> 466.67
    expect(result).toEqual({
      eligible: true,
      direction: 'upgrade',
      amount: 466.67,
      daysRemaining: 7,
    });
  });

  it('charges nothing for a downgrade', () => {
    const result = assessChange({
      next: basic,
      current: { ...current, plan: premium },
      today,
    });

    expect(result).toEqual({
      eligible: true,
      direction: 'downgrade',
      amount: 0,
      daysRemaining: 60,
    });
  });

  it('charges nothing for a lateral move', () => {
    const result = assessChange({
      next: plan(9, 9000, 45),
      current,
      today,
    });

    expect(result).toEqual({
      eligible: true,
      direction: 'lateral',
      amount: 0,
      daysRemaining: 60,
    });
  });

  it('refuses when there is no live subscription', () => {
    // Not an error at the call site: the member simply buys a term normally.
    expect(assessChange({ next: premium, current: null, today })).toEqual({
      eligible: false,
      reason: 'no_active_subscription',
    });
  });

  it('refuses a change to the plan the member is already on', () => {
    expect(assessChange({ next: basic, current, today })).toEqual({
      eligible: false,
      reason: 'same_plan',
    });
  });

  it.each(['pausada', 'pendiente', 'inactiva'])(
    'refuses a %s subscription',
    (state) => {
      expect(
        assessChange({ next: premium, current: { ...current, state }, today }),
      ).toEqual({ eligible: false, reason: 'not_current' });
    },
  );

  it('refuses a second change in the same term', () => {
    // The one-hop invariant: alreadyChanged is derived from
    // changedFromSubscriptionId by the caller. If this test ever has to be
    // relaxed, the termStartDate resolution in findChangeContext must stop
    // being a single hop and start being a walk.
    expect(
      assessChange({
        next: elite,
        current: { ...current, alreadyChanged: true },
        today,
      }),
    ).toEqual({ eligible: false, reason: 'already_changed' });
  });

  it('locks the term for its first 30 days', () => {
    const onDay29 = assessChange({
      next: premium,
      current: { ...current, termStartDate: '2026-01-02' },
      today: '2026-01-31',
    });
    expect(onDay29).toEqual({ eligible: false, reason: 'locked' });
  });

  it('unlocks on day 30 exactly', () => {
    const onDay30 = assessChange({
      next: premium,
      current: { ...current, termStartDate: '2026-01-01' },
      today: '2026-01-31',
    });
    expect(onDay30).toMatchObject({ eligible: true });
  });

  it('refuses a change in the last days of the term', () => {
    // 6 days left, MIN_CHANGE_DAYS is 7: change at renewal instead.
    expect(
      assessChange({
        next: premium,
        current: { ...current, endDate: '2026-02-05' },
        today: '2026-01-31',
      }),
    ).toEqual({ eligible: false, reason: 'too_close_to_end' });
  });

  it('allows a change with exactly MIN_CHANGE_DAYS left', () => {
    expect(
      assessChange({
        next: premium,
        current: { ...current, endDate: '2026-02-06' },
        today: '2026-01-31',
      }),
    ).toMatchObject({ eligible: true, daysRemaining: MIN_CHANGE_DAYS });
  });

  it('pins the policy constants, which are the whole business rule', () => {
    expect(PLAN_CHANGE_LOCK_DAYS).toBe(30);
    expect(MIN_CHANGE_DAYS).toBe(7);
  });
});

import { blockMessage } from './plan-change.rules';

describe('blockMessage', () => {
  it('tells the member the date the lock lifts', () => {
    expect(blockMessage('locked', { unlocksOn: '2026-02-01' })).toBe(
      'Podés cambiar de plan a partir del 01/02/2026.',
    );
  });

  it('sends a member near the end of their term to renewal', () => {
    expect(blockMessage('too_close_to_end', {})).toBe(
      'Te quedan menos de 7 días de plan. Vas a poder elegir otro plan al renovar.',
    );
  });

  it('has a message for every reason', () => {
    const reasons = [
      'no_active_subscription', 'not_current', 'locked',
      'already_changed', 'same_plan', 'too_close_to_end',
    ] as const;
    for (const reason of reasons) {
      expect(blockMessage(reason, {})).not.toBe('');
    }
  });
});
