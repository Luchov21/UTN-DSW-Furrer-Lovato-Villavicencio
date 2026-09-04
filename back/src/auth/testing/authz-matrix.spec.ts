import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { AnalyticsController } from '../../modules/analytics/analytics.controller';
import { AnalyticsService } from '../../modules/analytics/analytics.service';
import { OwnerPasswordGuard } from '../../modules/analytics/analytics.guard';
import { ClassController } from '../../modules/class/class.controller';
import { ClassService } from '../../modules/class/class.service';
import { ClassRegistrationController } from '../../modules/classRegistration/classRegistration.controller';
import { ClassRegistrationService } from '../../modules/classRegistration/classRegistration.service';
import { ClassSessionController } from '../../modules/classSession/classSession.controller';
import { ClassSessionService } from '../../modules/classSession/classSession.service';
import { CheckoutController } from '../../modules/checkout/checkout.controller';
import { CheckoutService } from '../../modules/checkout/checkout.service';
import { ContactController } from '../../modules/contact/contact.controller';
import { ContactService } from '../../modules/contact/contact.service';
import { PaymentController } from '../../modules/payment/payment.controller';
import { PaymentService } from '../../modules/payment/payment.service';
import { ReceiptPrintService } from '../../modules/receipt/receipt-print.service';
import { MercadoPagoConfig } from '../../modules/mercadopago/mercadopago.config';
import { PlanController } from '../../modules/plan/plan.controller';
import { PlanService } from '../../modules/plan/plan.service';
import { PlanDurationService } from '../../modules/plan/plan-duration.service';
import { subscriptionController } from '../../modules/subscription/subscription.controller';
import { subscriptionService } from '../../modules/subscription/subscription.service';
import { SavedCardService } from '../../modules/savedCard/savedCard.service';
import { TrainerController } from '../../modules/trainer/trainer.controller';
import { TrainerService } from '../../modules/trainer/trainer.service';
import { TypeClassController } from '../../modules/typeClass/typeClass.controller';
import { TypeClassService } from '../../modules/typeClass/typeClass.service';
import { UserController } from '../../modules/user/user.controller';
import { UserService } from '../../modules/user/user.service';

import { ANONYMOUS, buildAuthzApp, tokenFor } from './authz-harness';

// The endpoint x role authorization matrix. Every route of every controller is
// exercised as the three actors of the spec: anonymous, member and admin. The
// mocks return an empty object or array, because this file asserts
// reachability, not payloads — what a reachable route gives back belongs to
// Category 4.
//
// Where a route accepts a member identifier, the "member (another member's
// resource)" case is exercised too: the caller's token carries sub 40000001 and
// the path names 40000002.

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** The id carried by `tokenFor('member')`, i.e. the caller's own. */
const OWN_ID = 40000001;

/** A second member, used for the "another member's resource" column. */
const OTHER_ID = 40000002;

// A body is only ever needed where the handler dereferences the dto before
// reaching the mocked service; everywhere else the dto is passed straight
// through and an empty request is enough.
type Body = Record<string, unknown>;

const call = (
  app: INestApplication,
  method: Method,
  path: string,
  token: string | undefined,
  body?: Body,
) => {
  const agent = request(app.getHttpServer() as App);
  const req =
    method === 'get'
      ? agent.get(path)
      : method === 'post'
        ? agent.post(path)
        : method === 'put'
          ? agent.put(path)
          : method === 'patch'
            ? agent.patch(path)
            : agent.delete(path);
  const authed = token ? req.set('Authorization', `Bearer ${token}`) : req;
  return body ? authed.send(body) : authed;
};

/** Nest answers 201 to a POST and 200 to everything else. */
const okFor = (method: Method) => (method === 'post' ? 201 : 200);

/** No guard at all: every actor, including an anonymous one, gets through. */
const unguarded = async (
  app: INestApplication,
  method: Method,
  path: string,
  body?: Body,
) => {
  await call(app, method, path, ANONYMOUS, body).expect(okFor(method));
  await call(app, method, path, tokenFor('member'), body).expect(okFor(method));
  await call(app, method, path, tokenFor('admin'), body).expect(okFor(method));
};

/** `@Auth()`: a login is required, the admin role is not. */
const anyLoggedIn = async (
  app: INestApplication,
  method: Method,
  path: string,
  body?: Body,
) => {
  await call(app, method, path, ANONYMOUS, body).expect(401);
  await call(app, method, path, tokenFor('member'), body).expect(okFor(method));
  await call(app, method, path, tokenFor('admin'), body).expect(okFor(method));
};

/** `@Auth(Role.ADMIN)`: anonymous 401, member 403, admin through. */
const adminOnly = async (
  app: INestApplication,
  method: Method,
  path: string,
  body?: Body,
) => {
  await call(app, method, path, ANONYMOUS, body).expect(401);
  await call(app, method, path, tokenFor('member'), body).expect(403);
  await call(app, method, path, tokenFor('admin'), body).expect(okFor(method));
};

describe('AnalyticsController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(
      AnalyticsController,
      [
        {
          provide: AnalyticsService,
          useValue: {
            buildOverview: jest.fn().mockResolvedValue({}),
          },
        },
      ],
      [
        // This suite asserts *role* reachability, not the password boundary —
        // that is Task 18's OwnerPasswordGuard suite — so the guard is
        // overridden to always allow.
        {
          provide: OwnerPasswordGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /analytics/overview to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/analytics/overview');
  });
});

describe('AuthController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(AuthController, [
      {
        provide: AuthService,
        useValue: {
          register: jest.fn().mockResolvedValue({}),
          login: jest.fn().mockResolvedValue({}),
          googleLogin: jest.fn().mockResolvedValue({}),
          profile: jest.fn().mockResolvedValue({}),
          changePassword: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens POST /auth/register to everyone', async () => {
    await unguarded(app, 'post', '/api/v1/auth/register');
  });

  it('opens POST /auth/login to everyone', async () => {
    await unguarded(app, 'post', '/api/v1/auth/login');
  });

  it('opens POST /auth/google-login to everyone', async () => {
    await unguarded(app, 'post', '/api/v1/auth/google-login');
  });

  it('requires a login for GET /auth/profile, any role', async () => {
    await anyLoggedIn(app, 'get', '/api/v1/auth/profile');
  });

  it('opens POST /auth/change-password to any logged-in caller', async () => {
    await anyLoggedIn(app, 'post', '/api/v1/auth/change-password');
  });
});

describe('ClassController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(ClassController, [
      {
        provide: ClassService,
        useValue: {
          createClass: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findClass: jest.fn().mockResolvedValue({}),
          updateClass: jest.fn().mockResolvedValue({}),
          deleteClass: jest.fn().mockResolvedValue({}),
          restoreClass: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /class to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/class');
  });

  it('opens the catalogue GET /class to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/class');
  });

  it('restricts GET /class/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/class/filter/deleted');
  });

  it('opens GET /class/:id to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/class/1');
  });

  it('restricts PUT /class to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/class');
  });

  it('restricts DELETE /class/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/class/1');
  });

  it('restricts PATCH /class/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/class/restore/1');
  });
});

describe('ClassRegistrationController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(ClassRegistrationController, [
      {
        provide: ClassRegistrationService,
        useValue: {
          findMyEnrollments: jest.fn().mockResolvedValue({}),
          enroll: jest.fn().mockResolvedValue({}),
          changeEnrollment: jest.fn().mockResolvedValue({}),
          cancelEnrollment: jest.fn().mockResolvedValue({}),
          adminSetEnrollment: jest.fn().mockResolvedValue({}),
          createClassRegistration: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findClassRegistration: jest.fn().mockResolvedValue({}),
          updateClassRegistration: jest.fn().mockResolvedValue({}),
          deleteClassRegistration: jest.fn().mockResolvedValue({}),
          restoreClassRegistration: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  // The four self-service routes: the method-level @Auth() replaces the
  // class-level @Auth(Role.ADMIN), so any authenticated caller reaches them.
  it('opens GET /classRegistration/me to any logged-in caller', async () => {
    await anyLoggedIn(app, 'get', '/api/v1/classRegistration/me');
  });

  it('opens POST /classRegistration/enroll to any logged-in caller', async () => {
    await anyLoggedIn(app, 'post', '/api/v1/classRegistration/enroll');
  });

  it('opens PUT /classRegistration/me to any logged-in caller', async () => {
    await anyLoggedIn(app, 'put', '/api/v1/classRegistration/me');
  });

  it('opens DELETE /classRegistration/enrollment/:group to any logged-in caller', async () => {
    await anyLoggedIn(app, 'delete', '/api/v1/classRegistration/enrollment/g1');
  });

  it('restricts GET /classRegistration/admin/:id to an admin', async () => {
    await adminOnly(app, 'get', `/api/v1/classRegistration/admin/${OWN_ID}`);
    // Member reading another member's enrollments.
    await call(
      app,
      'get',
      `/api/v1/classRegistration/admin/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts PUT /classRegistration/admin/:id to an admin', async () => {
    await adminOnly(app, 'put', `/api/v1/classRegistration/admin/${OWN_ID}`);
    await call(
      app,
      'put',
      `/api/v1/classRegistration/admin/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts DELETE /classRegistration/admin/:id/:group to an admin', async () => {
    await adminOnly(
      app,
      'delete',
      `/api/v1/classRegistration/admin/${OWN_ID}/g1`,
    );
    await call(
      app,
      'delete',
      `/api/v1/classRegistration/admin/${OTHER_ID}/g1`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts POST /classRegistration to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/classRegistration');
  });

  it('restricts GET /classRegistration to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/classRegistration');
  });

  it('restricts GET /classRegistration/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/classRegistration/filter/deleted');
  });

  it('restricts GET /classRegistration/:id to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/classRegistration/1');
  });

  it('restricts PUT /classRegistration to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/classRegistration');
  });

  it('restricts DELETE /classRegistration/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/classRegistration/1');
  });

  it('restricts PATCH /classRegistration/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/classRegistration/restore/1');
  });
});

describe('ClassSessionController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(ClassSessionController, [
      {
        provide: ClassSessionService,
        useValue: {
          createClassSession: jest.fn().mockResolvedValue({}),
          createWeeklySlots: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findClassSession: jest.fn().mockResolvedValue({}),
          updateClassSession: jest.fn().mockResolvedValue({}),
          deleteClassSession: jest.fn().mockResolvedValue({}),
          restoreClassSession: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /classSession to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/classSession');
  });

  it('restricts POST /classSession/weekly to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/classSession/weekly');
  });

  it('opens GET /classSession to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/classSession');
  });

  it('restricts GET /classSession/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/classSession/filter/deleted');
  });

  it('opens GET /classSession/:id to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/classSession/1');
  });

  it('restricts PUT /classSession to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/classSession');
  });

  it('restricts DELETE /classSession/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/classSession/1');
  });

  it('restricts PATCH /classSession/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/classSession/restore/1');
  });
});

describe('CheckoutController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(CheckoutController, [
      {
        provide: CheckoutService,
        useValue: {
          getSummary: jest.fn().mockResolvedValue({}),
          pay: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  // Public on purpose: a guest prices a plan on /checkout before they have an
  // account, and this returns plan pricing only — no member data.
  it('opens GET /checkout/summary to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/checkout/summary');
  });

  // @Auth(Role.USER): a login is required, the admin role is not — an admin
  // buying their own membership is a member here like anyone else.
  it('requires a login for POST /checkout, any role', async () => {
    await anyLoggedIn(app, 'post', '/api/v1/checkout');
  });
});

describe('ContactController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(ContactController, [
      {
        provide: ContactService,
        useValue: {
          create: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findOne: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens POST /contact to everyone, as the public contact form', async () => {
    await unguarded(app, 'post', '/api/v1/contact');
  });

  it('restricts GET /contact to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/contact');
  });

  it('restricts GET /contact/:id to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/contact/1');
  });
});

describe('PaymentController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(PaymentController, [
      {
        provide: PaymentService,
        useValue: {
          findMineForUser: jest.fn().mockResolvedValue([]),
          createManualPayment: jest.fn().mockResolvedValue({}),
          registerPlanPayment: jest.fn().mockResolvedValue({}),
          createPayment: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findByUser: jest.fn().mockResolvedValue([]),
          findPayment: jest.fn().mockResolvedValue({}),
          updatePayment: jest.fn().mockResolvedValue({}),
          deletePayment: jest.fn().mockResolvedValue({}),
          restorePayment: jest.fn().mockResolvedValue({}),
        },
      },
      {
        provide: ReceiptPrintService,
        useValue: {
          printPaymentReceipt: jest.fn().mockResolvedValue({ status: 'sent' }),
        },
      },
      {
        // Disabled: this matrix asserts reachability, not printing — leaving
        // Mercado Pago "off" keeps createManualPayment/registerPlanPayment's
        // {} responses from tripping the printable-method branch.
        provide: MercadoPagoConfig,
        useValue: {
          enabled: false,
          pointTerminalId: undefined,
        } as unknown as Record<string, jest.Mock>,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('opens GET /Payment/me to any logged-in caller', async () => {
    await anyLoggedIn(app, 'get', '/api/v1/Payment/me');
  });

  it('restricts POST /Payment/manual to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/Payment/manual');
  });

  it('restricts POST /Payment/checkout to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/Payment/checkout');
  });

  it('restricts POST /Payment to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/Payment');
  });

  it('restricts GET /Payment to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/Payment');
  });

  it('restricts GET /Payment/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/Payment/filter/deleted');
  });

  it('restricts GET /Payment/by-user/:id to an admin', async () => {
    await adminOnly(app, 'get', `/api/v1/Payment/by-user/${OWN_ID}`);
    // A member asking for somebody else's payment history.
    await call(
      app,
      'get',
      `/api/v1/Payment/by-user/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts GET /Payment/:id to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/Payment/1');
  });

  it('restricts PUT /Payment to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/Payment');
  });

  it('restricts DELETE /Payment/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/Payment/1');
  });

  it('restricts PATCH /Payment/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/Payment/restore/1');
  });
});

describe('PlanController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(PlanController, [
      {
        provide: PlanService,
        useValue: {
          createPlan: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findPlan: jest.fn().mockResolvedValue({}),
          updatePlan: jest.fn().mockResolvedValue({}),
          deletePlan: jest.fn().mockResolvedValue({}),
          restorePlan: jest.fn().mockResolvedValue({}),
        },
      },
      {
        provide: PlanDurationService,
        useValue: {
          findByPlan: jest.fn().mockResolvedValue([]),
          create: jest.fn().mockResolvedValue({}),
          update: jest.fn().mockResolvedValue({}),
          remove: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /plan to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/plan');
  });

  it('opens GET /plan to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/plan');
  });

  it('restricts GET /plan/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/plan/filter/deleted');
  });

  it('opens GET /plan/:id to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/plan/1');
  });

  it('restricts PUT /plan to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/plan');
  });

  it('restricts DELETE /plan/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/plan/1');
  });

  it('restricts PATCH /plan/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/plan/restore/1');
  });

  it('restricts GET /plan/:id/duration to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/plan/1/duration');
  });

  it('restricts POST /plan/:id/duration to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/plan/1/duration');
  });

  it('restricts PUT /plan/:id/duration/:durationId to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/plan/1/duration/1');
  });

  it('restricts DELETE /plan/:id/duration/:durationId to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/plan/1/duration/1');
  });
});

describe('subscriptionController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(subscriptionController, [
      {
        provide: subscriptionService,
        useValue: {
          assignPlanToMember: jest.fn().mockResolvedValue({}),
          findActiveForUser: jest.fn().mockResolvedValue({}),
          createSubscription: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findByUser: jest.fn().mockResolvedValue([]),
          findSubscription: jest.fn().mockResolvedValue({}),
          updateSubscription: jest.fn().mockResolvedValue({}),
          deleteSubscription: jest.fn().mockResolvedValue({}),
          restoreSubscription: jest.fn().mockResolvedValue({}),
        },
      },
      {
        provide: SavedCardService,
        useValue: {
          findActiveForUser: jest.fn().mockResolvedValue(null),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  // There is deliberately no member-facing change-plan route anymore: a
  // member's subscription is created or extended only by a paid checkout or
  // by an admin. This asserts the route is gone for every actor, not merely
  // guarded — a 404 happens before any guard runs, so this fails if the
  // handler is ever "restored" behind a role check instead of removed.
  it('no longer exposes a member-facing change-plan route', async () => {
    const body = { planId: 1 };

    await call(
      app,
      'post',
      '/api/v1/subscription/change-plan',
      ANONYMOUS,
      body,
    ).expect(404);
    await call(
      app,
      'post',
      '/api/v1/subscription/change-plan',
      tokenFor('member'),
      body,
    ).expect(404);
    await call(
      app,
      'post',
      '/api/v1/subscription/change-plan',
      tokenFor('admin'),
      body,
    ).expect(404);
  });

  it('restricts POST /subscription/admin/:id to an admin', async () => {
    await adminOnly(app, 'post', `/api/v1/subscription/admin/${OWN_ID}`, {
      planId: 1,
    });
    // A member assigning a plan to somebody else.
    await call(
      app,
      'post',
      `/api/v1/subscription/admin/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('opens GET /subscription/me to any logged-in caller', async () => {
    await anyLoggedIn(app, 'get', '/api/v1/subscription/me');
  });

  it('restricts POST /subscription to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/subscription');
  });

  it('restricts GET /subscription to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/subscription');
  });

  it('restricts GET /subscription/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/subscription/filter/deleted');
  });

  it('restricts GET /subscription/by-user/:id to an admin', async () => {
    await adminOnly(app, 'get', `/api/v1/subscription/by-user/${OWN_ID}`);
    // A member asking for somebody else's subscription history.
    await call(
      app,
      'get',
      `/api/v1/subscription/by-user/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts GET /subscription/:id to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/subscription/1');
  });

  it('restricts PUT /subscription to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/subscription');
  });

  it('restricts DELETE /subscription/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/subscription/1');
  });

  it('restricts PATCH /subscription/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/subscription/restore/1');
  });
});

describe('TrainerController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(TrainerController, [
      {
        provide: TrainerService,
        useValue: {
          createTrainer: jest.fn().mockResolvedValue({}),
          findAllWithClasses: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findAllForAdmin: jest.fn().mockResolvedValue([]),
          findTrainerWithClasses: jest.fn().mockResolvedValue({}),
          updateTrainer: jest.fn().mockResolvedValue({}),
          deleteTrainer: jest.fn().mockResolvedValue({}),
          restoreTrainer: jest.fn().mockResolvedValue({}),
          setTrainerPhoto: jest.fn().mockResolvedValue({}),
          removeTrainerPhoto: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /trainer to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/trainer');
  });

  it('opens GET /trainer to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/trainer');
  });

  it('restricts GET /trainer/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/trainer/filter/deleted');
  });

  it('restricts GET /trainer/admin to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/trainer/admin');
  });

  it('opens GET /trainer/:dni to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/trainer/30111222');
  });

  it('restricts PUT /trainer to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/trainer');
  });

  it('restricts DELETE /trainer/:dni to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/trainer/30111222');
  });

  it('restricts PATCH /trainer/restore/:dni to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/trainer/restore/30111222');
  });

  it('restricts POST /trainer/:dni/photo to an admin', async () => {
    const path = '/api/v1/trainer/30111222/photo';
    await call(app, 'post', path, ANONYMOUS).expect(401);
    await call(app, 'post', path, tokenFor('member')).expect(403);
    // The guards let the admin through; the handler then rejects the empty
    // multipart body with its own 400, which is what proves reachability.
    await call(app, 'post', path, tokenFor('admin')).expect(400);
  });

  it('restricts DELETE /trainer/:dni/photo to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/trainer/30111222/photo');
  });
});

describe('TypeClassController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(TypeClassController, [
      {
        provide: TypeClassService,
        useValue: {
          createTypeClass: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findTypeClass: jest.fn().mockResolvedValue({}),
          updateTypeClass: jest.fn().mockResolvedValue({}),
          deleteTypeClass: jest.fn().mockResolvedValue({}),
          restoreTypeClass: jest.fn().mockResolvedValue({}),
        },
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /typeClass to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/typeClass');
  });

  it('opens GET /typeClass to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/typeClass');
  });

  it('restricts GET /typeClass/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/typeClass/filter/deleted');
  });

  it('opens GET /typeClass/:id to everyone', async () => {
    await unguarded(app, 'get', '/api/v1/typeClass/1');
  });

  it('restricts PUT /typeClass to an admin', async () => {
    await adminOnly(app, 'put', '/api/v1/typeClass');
  });

  it('restricts DELETE /typeClass/:id to an admin', async () => {
    await adminOnly(app, 'delete', '/api/v1/typeClass/1');
  });

  it('restricts PATCH /typeClass/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', '/api/v1/typeClass/restore/1');
  });
});

describe('UserController authorization', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildAuthzApp(UserController, [
      {
        provide: UserService,
        useValue: {
          adminCreateUser: jest.fn().mockResolvedValue({}),
          updateProfile: jest.fn().mockResolvedValue({}),
          findAll: jest.fn().mockResolvedValue([]),
          searchUsers: jest.fn().mockResolvedValue([]),
          findAllDeleted: jest.fn().mockResolvedValue([]),
          findUser: jest.fn().mockResolvedValue({}),
          adminUpdateUser: jest.fn().mockResolvedValue({}),
          deleteUsers: jest.fn().mockResolvedValue({}),
          restoreUsers: jest.fn().mockResolvedValue({}),
        },
      },
      {
        provide: ReceiptPrintService,
        useValue: {
          printCredentialsSlip: jest.fn().mockResolvedValue({ status: 'sent' }),
        },
      },
      {
        provide: MercadoPagoConfig,
        useValue: {
          enabled: false,
          pointTerminalId: undefined,
        } as unknown as Record<string, jest.Mock>,
      },
    ]);
  });

  afterAll(async () => {
    await app.close();
  });

  it('restricts POST /user to an admin', async () => {
    await adminOnly(app, 'post', '/api/v1/user');
  });

  it('restricts POST /user/:id/credentials-slip to an admin', async () => {
    await adminOnly(app, 'post', `/api/v1/user/${OWN_ID}/credentials-slip`);
  });

  it('opens PATCH /user/me to any logged-in caller', async () => {
    await anyLoggedIn(app, 'patch', '/api/v1/user/me');
  });

  it('restricts GET /user to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/user');
  });

  it('restricts GET /user/search to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/user/search');
    // A member searching the member directory by somebody else's dni.
    await call(
      app,
      'get',
      `/api/v1/user/search?dni=${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts GET /user/filter/deleted to an admin', async () => {
    await adminOnly(app, 'get', '/api/v1/user/filter/deleted');
  });

  it('restricts GET /user/:id to an admin', async () => {
    await adminOnly(app, 'get', `/api/v1/user/${OWN_ID}`);
    // A member reading another member's profile.
    await call(
      app,
      'get',
      `/api/v1/user/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts PATCH /user/:id to an admin', async () => {
    await adminOnly(app, 'patch', `/api/v1/user/${OWN_ID}`);
    // A member editing another member's profile, role included.
    await call(
      app,
      'patch',
      `/api/v1/user/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts DELETE /user/:id to an admin', async () => {
    await adminOnly(app, 'delete', `/api/v1/user/${OWN_ID}`);
    await call(
      app,
      'delete',
      `/api/v1/user/${OTHER_ID}`,
      tokenFor('member', OWN_ID),
    ).expect(403);
  });

  it('restricts PATCH /user/restore/:id to an admin', async () => {
    await adminOnly(app, 'patch', `/api/v1/user/restore/${OWN_ID}`);
  });
});

// The completion gate as an axis of the matrix. A member whose token says
// profileComplete: false may reach exactly three routes, and nothing else.
describe('completion gate', () => {
  let app: INestApplication;

  const authServiceMock = {
    provide: AuthService,
    useValue: {
      profile: jest.fn().mockResolvedValue({}),
      completeProfile: jest.fn().mockResolvedValue({ token: 't', user: {} }),
      login: jest.fn().mockResolvedValue({}),
      register: jest.fn().mockResolvedValue({}),
      googleLogin: jest.fn().mockResolvedValue({}),
    },
  };

  afterEach(async () => {
    await app?.close();
  });

  const incompleteToken = () => tokenFor('member', OWN_ID, false);

  it('lets an incomplete member read their own profile', async () => {
    app = await buildAuthzApp(AuthController, [authServiceMock]);

    await call(app, 'get', '/api/v1/auth/profile', incompleteToken()).expect(
      200,
    );
  });

  it('lets an incomplete member complete their profile', async () => {
    app = await buildAuthzApp(AuthController, [authServiceMock]);

    await call(
      app,
      'post',
      '/api/v1/auth/complete-profile',
      incompleteToken(),
      {
        dni: 40123456,
        phone: '3411234567',
      },
    ).expect(201);
  });

  it('lets an incomplete member edit their own profile', async () => {
    app = await buildAuthzApp(UserController, [
      {
        provide: UserService,
        useValue: { updateProfile: jest.fn().mockResolvedValue({}) },
      },
      { provide: ReceiptPrintService, useValue: {} },
      {
        provide: MercadoPagoConfig,
        useValue: { enabled: false, pointTerminalId: undefined } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    ]);

    await call(app, 'patch', '/api/v1/user/me', incompleteToken(), {
      name: 'Ana',
    }).expect(200);
  });

  it('refuses an incomplete member on a gated member route', async () => {
    app = await buildAuthzApp(subscriptionController, [
      {
        provide: subscriptionService,
        useValue: { findActiveForUser: jest.fn().mockResolvedValue({}) },
      },
      {
        provide: SavedCardService,
        useValue: { findActiveForUser: jest.fn().mockResolvedValue(null) },
      },
    ]);

    const response = await call(
      app,
      'get',
      '/api/v1/subscription/me',
      incompleteToken(),
    ).expect(403);

    expect((response.body as { code?: string }).code).toBe(
      'PROFILE_INCOMPLETE',
    );
  });

  it('refuses an incomplete admin on the admin surface', async () => {
    // An admin is not exempt: the account that repairs member data must not be
    // the account allowed to hold bad data.
    app = await buildAuthzApp(UserController, [
      {
        provide: UserService,
        useValue: { findAll: jest.fn().mockResolvedValue([]) },
      },
      { provide: ReceiptPrintService, useValue: {} },
      {
        provide: MercadoPagoConfig,
        useValue: { enabled: false, pointTerminalId: undefined } as unknown as Record<
          string,
          jest.Mock
        >,
      },
    ]);

    await call(
      app,
      'get',
      '/api/v1/user',
      tokenFor('admin', OWN_ID, false),
    ).expect(403);
  });
});
