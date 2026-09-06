import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { Subscription } from '../modules/subscription/entity/subscription.entity';
import { SubscriptionState } from '../modules/subscription/enum/subscription-state.enum';

/**
 * One-off cleanup for the retired "pay at the gym" flow.
 *
 * Those subscriptions were opened by a self-service route that no longer
 * exists, against a promise the product has withdrawn: nobody can settle them
 * online, and leaving them PENDING strands the member in a state with no path
 * forward on either side of the counter.
 *
 * Idempotent — a second run matches nothing.
 */
export async function cancelPendingSubscriptions(repository: {
  update: (
    criteria: { state: string; deleted: boolean },
    values: { state: string },
  ) => Promise<{ affected?: number | null }>;
}): Promise<number> {
  const result = await repository.update(
    { state: SubscriptionState.PENDING, deleted: false },
    { state: SubscriptionState.CANCELLED },
  );
  return result.affected ?? 0;
}

async function main(): Promise<void> {
  const logger = new Logger('cancel-pending-subscriptions');
  const app = await NestFactory.createApplicationContext(AppModule);
  try {
    const repository = app.get(getRepositoryToken(Subscription));
    const affected = await cancelPendingSubscriptions(repository);
    logger.log(`Cancelled ${affected} pending subscription(s).`);
  } finally {
    await app.close();
  }
}

// Only runs when invoked directly, so importing it from the test does not
// boot the whole application and connect to MySQL.
if (require.main === module) {
  void main();
}
