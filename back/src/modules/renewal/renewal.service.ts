import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MercadoPagoConfig } from '../mercadopago/mercadopago.config';
import {
  MercadoPagoClient,
  MercadoPagoUnavailableError,
  MpPaymentResult,
} from '../mercadopago/mercadopago.client';
import { subscriptionService } from '../subscription/subscription.service';
import { SavedCardService } from '../savedCard/savedCard.service';
import { PaymentService } from '../payment/payment.service';
import { PlanService } from '../plan/plan.service';
import { MailService } from '../../common/mail/mail.service';
import {
  renewalDueDates,
  renewalPeriod,
  toDateOnly,
} from '../subscription/subscription.rules';
import { isChargeable } from '../savedCard/savedCard.rules';
import { Subscription } from '../subscription/entity/subscription.entity';

type ChargeOutcome = 'charged' | 'declined' | 'skipped' | 'unreachable';

// The nightly job that charges every auto-renewing member's saved card
// before their membership lapses — unattended, and touching real money. Every
// failure mode here is deliberately narrow:
//  - `config.enabled` gates the whole sweep off wherever MP credentials
//    aren't configured (dev, CI), so it never throws nightly there.
//  - Each subscription is processed in its own try/catch (chargeOne, called
//    from within chargeDueSubscriptions' loop) so one bad row can never stop
//    the rest of the sweep from running.
//  - MercadoPagoUnavailableError (an outage: we don't know what happened) is
//    caught and handled entirely separately from a normal decline (a
//    resolved, non-approved MpPaymentResult) — an outage must not consume
//    one of the member's three retry attempts, nor tell them their card
//    failed when it may not have.
@Injectable()
export class RenewalService {
  private readonly logger = new Logger(RenewalService.name);

  constructor(
    private readonly config: MercadoPagoConfig,
    private readonly subscriptionService: subscriptionService,
    private readonly savedCardService: SavedCardService,
    private readonly mercadoPagoClient: MercadoPagoClient,
    private readonly paymentService: PaymentService,
    private readonly mailService: MailService,
    private readonly planService: PlanService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async chargeDueSubscriptions(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const dueDates = renewalDueDates(toDateOnly(new Date()));
    const subscriptions =
      await this.subscriptionService.findDueForRenewal(dueDates);

    let charged = 0;
    let declined = 0;
    let skipped = 0;
    let unreachable = 0;
    let errored = 0;

    for (const sub of subscriptions) {
      try {
        const outcome = await this.chargeOne(sub, dueDates);
        switch (outcome) {
          case 'charged':
            charged++;
            break;
          case 'declined':
            declined++;
            break;
          case 'skipped':
            skipped++;
            break;
          case 'unreachable':
            unreachable++;
            break;
        }
      } catch (err) {
        // Per-subscription isolation: one member's unexpected error must
        // never stop the sweep from processing the rest. No card data, no
        // tokens, no full error object — just the subscription id and the
        // error's own message.
        errored++;
        this.logger.error(
          `Unexpected error renewing subscription ${sub.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    this.logger.log(
      `Renewal sweep done — charged: ${charged}, declined: ${declined}, skipped: ${skipped}, unreachable: ${unreachable}, errored: ${errored}`,
    );
  }

  // One subscription's worth of work. Left un-decorated by any try/catch of
  // its own for the outer per-subscription errors — that isolation lives in
  // the loop in chargeDueSubscriptions, so every unexpected throw here (a
  // bug, a bad payment write) surfaces there and gets counted/logged, not
  // swallowed silently in this method. The one thing THIS method does
  // isolate is MercadoPagoUnavailableError, since an outage must be handled
  // completely differently from every other failure.
  private async chargeOne(
    sub: Subscription,
    dueDates: string[],
  ): Promise<ChargeOutcome> {
    // sub.endDate may come back from the DB as a Date or as a raw
    // 'YYYY-MM-DD' string (MySQL date column) — the same tolerance pattern
    // subscription.rules.ts uses elsewhere (isCurrentOn, renewalPeriod).
    const endDateStr =
      sub.endDate instanceof Date
        ? toDateOnly(sub.endDate)
        : String(sub.endDate).slice(0, 10);

    const card = await this.savedCardService.findActiveForUser(sub.userId);
    if (!card || !isChargeable(card, new Date())) {
      // No card, or a card that's expired — both are a normal state to skip,
      // not an error.
      return 'skipped';
    }

    // The plan the next term will actually open on — renew() applies a
    // scheduled downgrade, so charging sub.plan.price here would bill the
    // member for a plan they are leaving.
    const effectivePlan =
      sub.scheduledPlanId != null
        ? ((await this.planService.findPlan(sub.scheduledPlanId)) ?? sub.plan)
        : sub.plan;

    const amount = effectivePlan.price;
    const idempotencyKey = `renewal-${sub.id}-${endDateStr}`;

    let result: MpPaymentResult;
    try {
      result = await this.mercadoPagoClient.chargeSavedCard({
        customerId: card.mpCustomerId,
        cardId: card.mpCardId,
        amount,
        description: `Renovación de membresía — suscripción #${sub.id}`,
        idempotencyKey,
        paymentMethodId: card.paymentMethodId,
        // card.paymentTypeId is string | null on the entity; isChargeable,
        // called just above, already guarantees it's non-null here.
        paymentTypeId: card.paymentTypeId as string,
      });
    } catch (err) {
      if (err instanceof MercadoPagoUnavailableError) {
        // We don't know what happened — an outage, not a decline. No
        // payment row, no email, no retry attempt consumed: tomorrow's (or
        // the day after's) run tries again on its own.
        this.logger.warn(
          `Mercado Pago unreachable while renewing subscription ${sub.id}: ${err.message}`,
        );
        return 'unreachable';
      }
      throw err;
    }

    if (result.status === 'approved') {
      await this.paymentService.createFromMercadoPago({
        mpPaymentId: result.id,
        mpOrderId: result.mpOrderId,
        subscriptionId: sub.id,
        amount,
        // Auto-renewal always renews by ONE month, never the member's
        // original multi-month term.
        termMonths: 1,
        payMethod: 'mercadopago',
        registeredById: null,
      });

      // Mirrors exactly what promoteOrExtendSubscription computes internally
      // for termMonths = 1 (1 * effectivePlan.numDays), so the receipt shows
      // the real new endDate without an extra query back to the subscription.
      const { endDate: newEndDate } = renewalPeriod(
        endDateStr,
        effectivePlan.numDays,
      );

      await this.mailService.sendPaymentReceipt({
        to: sub.user.email,
        name: sub.user.name,
        planName: effectivePlan.name,
        amount,
        termMonths: 1,
        method: 'mercadopago',
        newEndDate,
      });

      return 'charged';
    }

    // A decline: a successful, resolved API call that just wasn't approved —
    // not an exception. The subscription is left exactly as it was; no
    // activate/renew call happens anywhere on this branch.
    await this.paymentService.createFailedPayment({
      subscriptionId: sub.id,
      amount,
      payMethod: 'mercadopago',
      termMonths: 1,
      // Same effectivePlan as `amount` above: a declined attempt to renew
      // onto a scheduled plan was never an attempt to renew at the old
      // plan's price.
      monthlyPriceAtPurchase: effectivePlan.price,
    });

    // dueDates is furthest-first: index 0 is the FIRST attempt
    // chronologically (3 days out), the last index is the FINAL attempt (1
    // day out — the member's last chance before the nightly expiry sweep
    // takes over). A subscription is only ever selected on exactly one of
    // the RENEWAL_LEAD_DAYS dates per run, so comparing endDateStr against
    // both ends of dueDates is enough to place today's attempt.
    const isFirst = dueDates[0] === endDateStr;
    const isFinal = dueDates[dueDates.length - 1] === endDateStr;
    if (isFirst || isFinal) {
      await this.mailService.sendRenewalFailure({
        to: sub.user.email,
        name: sub.user.name,
        planName: effectivePlan.name,
        endDate: sub.endDate,
        isFinalAttempt: isFinal,
      });
    }

    return 'declined';
  }
}
