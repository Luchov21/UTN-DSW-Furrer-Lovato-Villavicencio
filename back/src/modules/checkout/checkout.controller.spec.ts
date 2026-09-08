import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { buildAuthzApp, tokenFor } from '../../auth/testing/authz-harness';

// The checkout is the one place a member spends money on themselves, and its
// two routes deliberately sit on opposite sides of the auth line: the summary
// is public so a guest can price a plan before signing up, the charge is not.
// Both are asserted by hitting the route, not by reading a decorator.
describe('CheckoutController', () => {
  let app: INestApplication;
  let checkoutService: { getSummary: jest.Mock; pay: jest.Mock };

  const validBody = {
    planId: 12,
    months: 1,
    cardToken: 'tok_abc',
    paymentMethodId: 'visa',
    paymentTypeId: 'credit_card',
    acceptedTerms: true,
  };

  beforeAll(async () => {
    checkoutService = {
      getSummary: jest.fn().mockResolvedValue({}),
      pay: jest.fn().mockResolvedValue({ status: 'approved' }),
    };

    app = await buildAuthzApp(
      CheckoutController,
      [{ provide: CheckoutService, useValue: checkoutService }],
      [],
      // main.ts's own pipe: without it the DTO decorators never run and the
      // acceptedTerms case below would pass for the wrong reason.
      [
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/checkout/summary', () => {
    it('answers an anonymous caller, with no Authorization header at all', async () => {
      // A guest prices a plan on /checkout before they have an account.
      // Requiring a token here would break the flow that needs it most, so
      // this deliberately sends no header rather than an empty one.
      await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/summary?planId=12&months=1')
        .expect(200);

      expect(checkoutService.getSummary).toHaveBeenCalledWith(12, 1);
    });

    it('answers a logged-in member too', async () => {
      await request(app.getHttpServer() as App)
        .get('/api/v1/checkout/summary?planId=12&months=1')
        .set('Authorization', `Bearer ${tokenFor('member')}`)
        .expect(200);
    });
  });

  describe('POST /api/v1/checkout', () => {
    it('refuses an anonymous caller', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout')
        .send(validBody)
        .expect(401);

      expect(checkoutService.pay).not.toHaveBeenCalled();
    });

    it('charges the member the JWT names, never a body-supplied id', async () => {
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${tokenFor('member', 40000001)}`)
        .send(validBody)
        .expect(201);

      expect(checkoutService.pay).toHaveBeenCalledWith(
        40000001,
        'member@flg.test',
        expect.objectContaining({ planId: 12, months: 1 }),
      );
    });

    it('lets an admin pay for their own membership', async () => {
      // @Auth(Role.USER) is a floor, not an exclusion — RolesGuard lets an
      // admin through every member route.
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${tokenFor('admin')}`)
        .send(validBody)
        .expect(201);
    });

    it('rejects a sale with acceptedTerms false', async () => {
      // The browser disables the button; @Equals(true) is what actually
      // refuses the sale.
      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${tokenFor('member')}`)
        .send({ ...validBody, acceptedTerms: false })
        .expect(400);

      expect(checkoutService.pay).not.toHaveBeenCalled();
    });

    it('rejects a sale with acceptedTerms omitted entirely', async () => {
      const withoutTerms = {
        planId: validBody.planId,
        months: validBody.months,
        cardToken: validBody.cardToken,
      };

      await request(app.getHttpServer() as App)
        .post('/api/v1/checkout')
        .set('Authorization', `Bearer ${tokenFor('member')}`)
        .send(withoutTerms)
        .expect(400);

      expect(checkoutService.pay).not.toHaveBeenCalled();
    });
  });
});
