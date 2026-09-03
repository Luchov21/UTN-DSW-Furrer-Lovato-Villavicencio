import { buildSummary } from './checkout.rules';
import type { Plan } from '../plan/entity/plan.entity';
import type { PlanDuration } from '../plan/entity/plan-duration.entity';

const plan = { id: 12, name: 'Plan Full', price: 19995, numDays: 30 } as Plan;

const durations = [
  { id: 1, planId: 12, months: 3, numDays: 90, price: 56000, deleted: false },
  { id: 2, planId: 12, months: 6, numDays: 180, price: 102000, deleted: false },
  { id: 3, planId: 12, months: 12, numDays: 365, price: 190000, deleted: true },
] as PlanDuration[];

describe('buildSummary', () => {
  it('has no discount for a single month', () => {
    const summary = buildSummary(plan, 1, durations);

    expect(summary.subtotal).toBe(19995);
    expect(summary.total).toBe(19995);
    expect(summary.discount).toBe(0);
  });

  it('derives the discount from the duration price', () => {
    const summary = buildSummary(plan, 6, durations);

    expect(summary.subtotal).toBe(119970);
    expect(summary.total).toBe(102000);
    expect(summary.discount).toBe(17970);
  });

  it('offers one month plus every non-deleted duration', () => {
    expect(buildSummary(plan, 1, durations).availableMonths).toEqual([1, 3, 6]);
  });

  it('never reports a negative discount', () => {
    const overpriced = [
      { id: 4, planId: 12, months: 3, numDays: 90, price: 99999, deleted: false },
    ] as PlanDuration[];

    expect(buildSummary(plan, 3, overpriced).discount).toBe(0);
  });

  it('always reports ARS', () => {
    expect(buildSummary(plan, 1, durations).currency).toBe('ARS');
  });
});
