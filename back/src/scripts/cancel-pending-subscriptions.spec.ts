import { cancelPendingSubscriptions } from './cancel-pending-subscriptions';
import { SubscriptionState } from '../modules/subscription/enum/subscription-state.enum';

describe('cancelPendingSubscriptions', () => {
  it('cancels every pending, non-deleted subscription', async () => {
    const repository = { update: jest.fn().mockResolvedValue({ affected: 3 }) };

    const affected = await cancelPendingSubscriptions(repository);

    expect(repository.update).toHaveBeenCalledWith(
      { state: SubscriptionState.PENDING, deleted: false },
      { state: SubscriptionState.CANCELLED },
    );
    expect(affected).toBe(3);
  });

  it('is idempotent — a second run finds nothing', async () => {
    const repository = { update: jest.fn().mockResolvedValue({ affected: 0 }) };

    expect(await cancelPendingSubscriptions(repository)).toBe(0);
  });
});
