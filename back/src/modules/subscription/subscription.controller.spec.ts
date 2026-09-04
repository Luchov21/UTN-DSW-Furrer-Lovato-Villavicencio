import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { subscriptionController } from './subscription.controller';
import { subscriptionService } from './subscription.service';
import { SavedCardService } from '../savedCard/savedCard.service';
import { buildAuthzApp, tokenFor } from '../../auth/testing/authz-harness';

// Far enough in the future that isChargeable never flips false on its own —
// these tests are about the controller's branching, not the expiry rule
// (that's savedCard.rules.spec.ts's job).
const chargeableCard = {
  active: true,
  deleted: false,
  expirationMonth: 12,
  expirationYear: 2099,
  paymentTypeId: 'credit_card',
};

const expiredCard = {
  active: true,
  deleted: false,
  expirationMonth: 1,
  expirationYear: 2020,
};

describe('subscriptionController.setAutoRenew', () => {
  let app: INestApplication;
  let subscriptions: { findActiveForUser: jest.Mock; setAutoRenew: jest.Mock };
  let savedCards: { findActiveForUser: jest.Mock };

  beforeAll(async () => {
    subscriptions = {
      findActiveForUser: jest.fn(),
      setAutoRenew: jest.fn(),
    };
    savedCards = { findActiveForUser: jest.fn() };

    app = await buildAuthzApp(subscriptionController, [
      { provide: subscriptionService, useValue: subscriptions },
      { provide: SavedCardService, useValue: savedCards },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  // Each test sets its own mockResolvedValue before acting, but call COUNTS
  // (asserted via toHaveBeenCalledWith / not.toHaveBeenCalled) would
  // otherwise accumulate across the whole describe block, since the app —
  // and the mock objects it was built with — are shared via beforeAll.
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const patchAutoRenew = (autoRenew: boolean) =>
    request(app.getHttpServer() as App)
      .patch('/api/v1/subscription/me/auto-renew')
      .set('Authorization', `Bearer ${tokenFor('member')}`)
      .send({ autoRenew });

  it('refuses to turn auto-renew on when the member has no active card', async () => {
    savedCards.findActiveForUser.mockResolvedValue(null);

    const response = await patchAutoRenew(true).expect(409);

    expect((response.body as { message?: string }).message).toBe(
      'Necesitás una tarjeta guardada para activar la renovación automática.',
    );
    expect(subscriptions.setAutoRenew).not.toHaveBeenCalled();
  });

  it('refuses to turn auto-renew on when the saved card is expired', async () => {
    // A card can exist and still not be chargeable — the gate must check
    // isChargeable, not just "a row exists".
    savedCards.findActiveForUser.mockResolvedValue(expiredCard);

    const response = await patchAutoRenew(true).expect(409);

    expect((response.body as { message?: string }).message).toBe(
      'Necesitás una tarjeta guardada para activar la renovación automática.',
    );
    expect(subscriptions.setAutoRenew).not.toHaveBeenCalled();
  });

  it('turns auto-renew on when an active, chargeable card exists', async () => {
    savedCards.findActiveForUser.mockResolvedValue(chargeableCard);
    subscriptions.findActiveForUser.mockResolvedValue({ id: 42 });
    subscriptions.setAutoRenew.mockResolvedValue({ id: 42, autoRenew: true });

    await patchAutoRenew(true).expect(200);

    expect(subscriptions.setAutoRenew).toHaveBeenCalledWith(42, true);
  });

  it('turns auto-renew off unconditionally, without needing a card at all', async () => {
    subscriptions.findActiveForUser.mockResolvedValue({ id: 42 });
    subscriptions.setAutoRenew.mockResolvedValue({ id: 42, autoRenew: false });
    // No card configured on savedCards.findActiveForUser at all here — if
    // the OFF path ever started gating on it, this mock (resolving
    // undefined) would make that failure visible instead of accidentally
    // "working" against a leftover mock from another test.
    savedCards.findActiveForUser.mockReset();

    await patchAutoRenew(false).expect(200);

    expect(savedCards.findActiveForUser).not.toHaveBeenCalled();
    expect(subscriptions.setAutoRenew).toHaveBeenCalledWith(42, false);
  });

  it('404s when the caller has no active subscription to toggle', async () => {
    savedCards.findActiveForUser.mockResolvedValue(chargeableCard);
    subscriptions.findActiveForUser.mockResolvedValue(null);

    await patchAutoRenew(true).expect(404);

    expect(subscriptions.setAutoRenew).not.toHaveBeenCalled();
  });
});
