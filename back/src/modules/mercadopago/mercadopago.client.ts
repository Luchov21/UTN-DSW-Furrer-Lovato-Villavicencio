import { Injectable, Logger } from '@nestjs/common';
import MpSdkConfig, {
  CardToken,
  Customer,
  Order,
  Payment,
  PaymentRefund,
  Preference,
} from 'mercadopago';
import {
  buildPreferenceBody,
  type PreferenceBodyInput,
} from '../checkout/checkout-preference.rules';
import { MercadoPagoConfig } from './mercadopago.config';

/**
 * The Orders API rejects anything but `'static'`, `'dynamic'`, or
 * `'hybrid'` for `config.qr.mode` (confirmed against the live API — a
 * request with `'hibrid'` 400s with "value must be one of 'static',
 * 'dynamic', 'hybrid'"). A previous version of this file claimed `'hibrid'`
 * was Mercado Pago's actual (typo'd) spelling and warned against "fixing"
 * it — that was wrong, or the API has since changed; either way, `'hibrid'`
 * silently broke every QR charge.
 */
export const QR_MODE_HYBRID = 'hybrid';

/**
 * Translates an Orders API order/transaction status into the classic
 * Payments API status vocabulary every caller of `MpPaymentResult` already
 * branches on (`approved`/`rejected`/`in_process`). `webhook.service.ts`'s
 * `fetchPaymentLike` and `MercadoPagoClient`'s own online-order charging both
 * use this — a synchronous charge and a later webhook retry for the same
 * order must always compute the same status, or the idempotency check in
 * `WebhookService.handleNotification` (keyed on the resulting `mpPaymentId`)
 * can't recognize them as the same thing.
 */
export function mapOrderStatusToPaymentStatus(
  status: string | undefined,
): string | undefined {
  switch (status) {
    case 'processed':
      return 'approved';
    case 'failed':
      return 'rejected';
    case 'processing':
    case 'action_required':
      return 'in_process';
    case 'canceled':
      return 'cancelled';
    default:
      // 'refunded', 'charged_back', 'created', or anything future — passed
      // through as-is. Neither current caller branches on these today.
      return status;
  }
}

/**
 * Thrown by every `MercadoPagoClient` method when the SDK call could not be
 * completed for any reason: a network failure, a 4xx/5xx response from
 * Mercado Pago, a malformed success response, or the client being called
 * while `MercadoPagoConfig.enabled` is `false`.
 *
 * This is deliberately a single, coarse error type. Downstream code (the
 * renewal cron, the webhook receiver, front-desk charges) must treat "we
 * don't know what happened" as distinct from a card decline: an outage must
 * not consume a retry attempt and must not cancel a membership. A decline is
 * a normal, successful SDK response (`status: 'rejected'`), not this error.
 *
 * The message never includes the access token or the raw request/response
 * body — only the failing operation's name and the underlying error's own
 * `message`, which Mercado Pago's SDK itself guarantees is built from the
 * response body, never the outgoing `Authorization` header.
 */
export class MercadoPagoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MercadoPagoUnavailableError';
    Object.setPrototypeOf(this, MercadoPagoUnavailableError.prototype);
  }
}

/** A Mercado Pago customer, the record saved cards are attached to. */
export interface MpCustomer {
  id: string;
  email?: string;
}

/** A card saved against a Mercado Pago customer. */
export interface MpSavedCard {
  id: string;
  lastFourDigits?: string;
  /** e.g. `visa`, `master` — nested under `payment_method` in the raw response. */
  paymentMethodId?: string;
  /**
   * `credit_card`/`debit_card` — also nested under `payment_method` in the
   * raw response. Both `saveCard` (the classic Customers API) and `getCard`
   * (listing a customer's saved cards) return it; a card saved through
   * `saveCard` with this left unset is permanently unchargeable by
   * `isChargeable`, so mapping it is not optional.
   */
  paymentTypeId?: string;
  expirationMonth?: number;
  expirationYear?: number;
}

export interface ChargeSavedCardInput {
  customerId: string;
  cardId: string;
  /** Amount to charge, in the account's currency units (e.g. ARS, not cents). */
  amount: number;
  description?: string;
  /** Maps the payment back to its ChargeOrder if the local write fails. */
  externalReference?: string;
  idempotencyKey: string;
  /** Card brand, e.g. `master` — from the SavedCard row. */
  paymentMethodId: string;
  /** `credit_card` or `debit_card` — from the SavedCard row. */
  paymentTypeId: string;
}

export interface ChargeCardTokenInput {
  token: string;
  /** Amount to charge, in the account's currency units (e.g. ARS, not cents). */
  amount: number;
  description?: string;
  /** Maps the payment back to its ChargeOrder if the local write fails. */
  externalReference: string;
  idempotencyKey: string;
  /** Card brand, e.g. `visa` — from the Card Payment Brick's onSubmit. */
  paymentMethodId: string;
  /** `credit_card` or `debit_card` — from the Card Payment Brick's onSubmit. */
  paymentTypeId: string;
  /**
   * Present only when the member asked to save the card: scoping the payment
   * to a Mercado Pago customer is what attaches the card to it, since the
   * token itself is single-use and is spent by this charge.
   */
  customerId?: string;
  /** Used as the payer when there is no customer. */
  payerEmail?: string;
}

/** Normalized shape for both `chargeSavedCard` and `getPayment`. */
export interface MpPaymentResult {
  id: string;
  status?: string;
  statusDetail?: string;
  transactionAmount?: number;
  /**
   * The `external_reference` the payment was created with — how the webhook
   * receiver (Task 14) maps an incoming notification back to whatever placed
   * the order (a front-desk charge order, eventually; a saved-card renewal
   * never needs this, since that flow already knows its own subscription id
   * without a webhook at all). Present on `getPayment`'s response; absent
   * from `chargeSavedCard`'s today only because nothing sets an
   * external_reference on that call yet.
   */
  externalReference?: string;
  /**
   * The Orders API order id this payment belongs to, when it originated from
   * one (an online checkout charge or a renewal). `undefined` for a payment
   * that went through the classic Payments API. `RefundService` uses this to
   * decide which refund endpoint a payment needs.
   */
  mpOrderId?: string;
  /**
   * The card this payment was made with, as Mercado Pago echoes it back on
   * the payment itself. When the charge was scoped to a customer, `id` is
   * that customer's saved card id — which is what lets the checkout persist
   * a `SavedCard` with no second API call, the token having already been
   * spent by the charge.
   *
   * Absent whenever the response carries no card at all (a rejected payment,
   * a non-card method). Every sub-field but `id` mirrors the SDK's own
   * optionality, so a caller that needs a complete card must check them.
   */
  card?: {
    id: string;
    lastFourDigits?: string;
    paymentMethodId?: string;
    /** `credit_card`/`debit_card` — from the request, echoed back here so
     * `rememberCard` can save it onto the new SavedCard row. */
    paymentTypeId?: string;
    expirationMonth?: number;
    expirationYear?: number;
  };
}

export interface MpRefundResult {
  id: string;
  status?: string;
  amount?: number;
}

export interface MpPreferenceResult {
  id: string;
  /** Checkout Pro's hosted URL. Only used by the A1 fallback (see the spec). */
  initPoint?: string;
}

export interface MpOrderResult {
  id: string;
  status?: string;
  statusDetail?: string;
  /** QR payload data, present for `type: 'qr'` orders. */
  qrData?: string;
  /**
   * The `external_reference` the order was created with — how the webhook
   * receiver maps an `order`-topic notification back to a `charge_orders`
   * row, the same role `MpPaymentResult.externalReference` plays for a
   * legacy Payments API notification.
   */
  externalReference?: string;
  /** Amount actually collected so far, as a number (e.g. ARS, not cents). */
  totalPaidAmount?: number;
  /**
   * The id of this order's first transaction payment (e.g. `PAY01...`) —
   * this is an Orders API resource id, NOT a legacy Payments API id, so it
   * must never be passed to `getPayment`/`GET /v1/payments/{id}` (that 404s).
   * It is only ever stored locally as `Payment.mpPaymentId`, an opaque
   * dedupe/reference key.
   */
  paymentId?: string;
}

interface CreateOrderRequestBase {
  externalReference: string;
  /** Amount in the account's currency units (e.g. ARS, not cents). */
  totalAmount: number;
  /** ISO 8601 duration (e.g. `PT30M`) controlling how long the order stays payable. */
  expirationTime?: string;
  description?: string;
  idempotencyKey: string;
}

export interface CreatePointOrderRequest extends CreateOrderRequestBase {
  type: 'point';
  /**
   * Point-specific config, placed under `config.point` close to as-is (e.g.
   * `{ terminal_id: '...' }`). The exact sub-fields the real Orders API
   * accepts for Point orders are confirmed by a later task (this SDK
   * version's types don't model them at all — see the comment in
   * `createOrder` below).
   */
  point: Record<string, unknown>;
}

export interface CreateQrOrderRequest extends CreateOrderRequestBase {
  type: 'qr';
  /**
   * QR-specific config, placed under `config.qr` close to as-is (e.g.
   * `{ external_pos_id: '...', mode: QR_MODE_HYBRID }`). Same caveat as
   * `CreatePointOrderRequest.point`.
   */
  qr: Record<string, unknown>;
}

export type CreateOrderRequest = CreatePointOrderRequest | CreateQrOrderRequest;

// The classes above are stateless facades around a config object — deriving
// their response/request types from the class methods themselves (rather
// than deep-importing the SDK's internal `dist/clients/**` type modules,
// which aren't part of its public `exports`) keeps this file pinned to the
// one public surface the SDK promises to keep stable.
type SdkCustomerResponse = Awaited<
  ReturnType<InstanceType<typeof Customer>['create']>
>;
type SdkCardResponse = Awaited<
  ReturnType<InstanceType<typeof Customer>['createCard']>
>;
type SdkCardListResponse = Awaited<
  ReturnType<InstanceType<typeof Customer>['listCards']>
>;
type SdkCardTokenResponse = Awaited<
  ReturnType<InstanceType<typeof CardToken>['create']>
>;
type SdkPaymentResponse = Awaited<
  ReturnType<InstanceType<typeof Payment>['create']>
>;
type SdkRefundResponse = Awaited<
  ReturnType<InstanceType<typeof PaymentRefund>['create']>
>;
type SdkOrderResponse = Awaited<
  ReturnType<InstanceType<typeof Order>['create']>
>;
type SdkOrderCreateBody = Parameters<
  InstanceType<typeof Order>['create']
>[0]['body'];

/**
 * The only class in the codebase that talks to the Mercado Pago SDK
 * directly. Every other module — the card vault, the renewal cron,
 * front-desk charges, refunds — depends on this instead, and is tested
 * against a mock of it rather than against the real SDK.
 *
 * All request/response shapes exposed here are our own, not the SDK's:
 * nothing downstream should ever need to know what the SDK's raw objects
 * look like, so a future SDK major-version bump only touches this file.
 */
@Injectable()
export class MercadoPagoClient {
  private readonly logger = new Logger(MercadoPagoClient.name);

  /** Memoized on first `getSdkConfig()` call — never built while disabled. */
  private sdkConfig?: MpSdkConfig;

  constructor(private readonly config: MercadoPagoConfig) {}

  private getSdkConfig(): MpSdkConfig {
    if (!this.config.enabled || !this.config.accessToken) {
      throw new MercadoPagoUnavailableError(
        'Mercado Pago is disabled (MP_ENABLED is not "true"); no client is available.',
      );
    }
    if (!this.sdkConfig) {
      this.sdkConfig = new MpSdkConfig({
        accessToken: this.config.accessToken,
      });
    }
    return this.sdkConfig;
  }

  /** Wraps any thrown value from an SDK call, never leaking the access token or raw payloads. */
  private wrapError(
    operation: string,
    err: unknown,
  ): MercadoPagoUnavailableError {
    const detail = err instanceof Error ? err.message : String(err);
    // status/causes are MP's own HTTP status code and structured validation
    // feedback about the REQUEST we sent — not secrets, and the only way to
    // tell "invalid token" (401) apart from "bad request shape" (400) apart
    // from "server outage" (5xx) from this message alone.
    const status = (err as { status?: unknown } | null)?.status;
    const causes = (err as { causes?: unknown } | null)?.causes;
    const extra = [
      status ? `status=${JSON.stringify(status)}` : null,
      causes && Array.isArray(causes) && causes.length > 0
        ? `causes=${JSON.stringify(causes)}`
        : null,
    ]
      .filter(Boolean)
      .join(' ');
    return new MercadoPagoUnavailableError(
      `Mercado Pago request failed (${operation}): ${detail}${extra ? ` [${extra}]` : ''}`,
    );
  }

  private normalizePayment(payment: SdkPaymentResponse): MpPaymentResult {
    if (payment.id === undefined) {
      throw new Error('Mercado Pago did not return a payment id.');
    }
    // `card` is an empty object on a payment that never had one, so the id —
    // not the presence of the key — is what decides whether there is a card
    // worth reporting. payment_method_id lives on the payment, not on the
    // nested card, exactly as `saveCard` reads it from `payment_method.id`.
    const card = payment.card?.id
      ? {
          id: payment.card.id,
          lastFourDigits: payment.card.last_four_digits,
          paymentMethodId: payment.payment_method_id,
          expirationMonth: payment.card.expiration_month,
          expirationYear: payment.card.expiration_year,
        }
      : undefined;

    return {
      id: String(payment.id),
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      externalReference: payment.external_reference,
      card,
    };
  }

  private normalizeOrder(order: SdkOrderResponse): MpOrderResult {
    if (!order.id) {
      throw new Error('Mercado Pago did not return an order id.');
    }
    return {
      id: order.id,
      status: order.status,
      statusDetail: order.status_detail,
      qrData: order.type_response?.qr_data,
      externalReference: order.external_reference,
      totalPaidAmount:
        order.total_paid_amount !== undefined
          ? Number(order.total_paid_amount)
          : undefined,
      paymentId: order.transactions?.payments?.[0]?.id,
    };
  }

  /**
   * Finds a customer by exact email match, creating one if none exists.
   * Mercado Pago customers are the anchor saved cards attach to.
   */
  async findOrCreateCustomer(email: string): Promise<MpCustomer> {
    const sdkConfig = this.getSdkConfig();
    try {
      const customerClient = new Customer(sdkConfig);
      const searchResult = await customerClient.search({ options: { email } });
      const existing: SdkCustomerResponse | undefined =
        searchResult.results?.[0];
      if (existing?.id) {
        return { id: existing.id, email: existing.email };
      }

      const created = await customerClient.create({ body: { email } });
      if (!created.id) {
        throw new Error('Mercado Pago did not return a customer id.');
      }
      return { id: created.id, email: created.email };
    } catch (err) {
      throw this.wrapError('findOrCreateCustomer', err);
    }
  }

  /**
   * Creates the preference that backs the Payment Brick's Mercado Pago
   * option. The body is built by a pure function so its rules are tested
   * without a network; this method only talks to the SDK.
   *
   * The caller must have resolved the price itself — `input.amount` is the
   * server's number, never the browser's.
   */
  async createPreference(
    input: PreferenceBodyInput,
  ): Promise<MpPreferenceResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const preferenceClient = new Preference(sdkConfig);
      const preferenceBody = buildPreferenceBody(input);
      const created = await preferenceClient.create({
        body: {
          ...preferenceBody,
          // The installed SDK's `Items` type requires an `id` per line item;
          // the Preferences API itself does not. `buildPreferenceBody`
          // (Task 3) deliberately omits it — this preference always has
          // exactly one item, already identified end-to-end by
          // `external_reference`, not a catalog id. The index-based value
          // below exists only to satisfy the SDK's type, the same class of
          // types-lag-the-API gap as `createOrder`'s `config` cast above.
          items: preferenceBody.items.map((item, index) => ({
            ...item,
            id: String(index),
          })),
        },
      });
      if (!created.id) {
        throw new Error('Mercado Pago did not return a preference id.');
      }
      return { id: created.id, initPoint: created.init_point };
    } catch (err) {
      throw this.wrapError('createPreference', err);
    }
  }

  /**
   * Saves a card for a customer from a (one-time) card token produced by
   * the front-end's tokenization flow.
   */
  async saveCard(customerId: string, cardToken: string): Promise<MpSavedCard> {
    const sdkConfig = this.getSdkConfig();
    try {
      const customerClient = new Customer(sdkConfig);
      const card: SdkCardResponse = await customerClient.createCard({
        customerId,
        body: { token: cardToken },
      });
      if (!card.id) {
        throw new Error('Mercado Pago did not return a card id.');
      }
      return {
        id: card.id,
        lastFourDigits: card.last_four_digits,
        paymentMethodId: card.payment_method?.id,
        paymentTypeId: card.payment_method?.payment_type_id,
        expirationMonth: card.expiration_month,
        expirationYear: card.expiration_year,
      };
    } catch (err) {
      throw this.wrapError('saveCard', err);
    }
  }

  async deleteCard(customerId: string, cardId: string): Promise<void> {
    const sdkConfig = this.getSdkConfig();
    try {
      const customerClient = new Customer(sdkConfig);
      await customerClient.removeCard({ customerId, cardId });
    } catch (err) {
      throw this.wrapError('deleteCard', err);
    }
  }

  /**
   * Looks up one card in a customer's saved-card list by id. Used only after
   * an online-order charge that attaches a NEW card to a customer: the order
   * response echoes the new card's id (`payment_method.card_id`) but not its
   * last-four-digits/expiration, so this fills in the rest — one call, only
   * on the save-card path, never in the common (no-save) charge path.
   */
  async getCard(
    customerId: string,
    cardId: string,
  ): Promise<MpSavedCard | undefined> {
    const sdkConfig = this.getSdkConfig();
    try {
      const customerClient = new Customer(sdkConfig);
      const cards: SdkCardListResponse = await customerClient.listCards({
        customerId,
      });
      const card = cards.find((c) => c.id === cardId);
      if (!card?.id) {
        return undefined;
      }

      return {
        id: card.id,
        lastFourDigits: card.last_four_digits,
        paymentMethodId: card.payment_method?.id,
        paymentTypeId: card.payment_method?.payment_type_id,
        expirationMonth: card.expiration_month,
        expirationYear: card.expiration_year,
      };
    } catch (err) {
      throw this.wrapError('getCard', err);
    }
  }

  /**
   * Builds and charges a `type: "online"` Orders API order — the shared
   * implementation behind both `chargeCardToken` (a fresh single-use token)
   * and `chargeSavedCard` (a token freshly minted from a saved card). Adapts
   * the order response back into `MpPaymentResult`, the same shape the
   * classic Payments API path this replaces already returned, so neither
   * caller needs to change how it reads the result.
   */
  private async chargeOnlineOrder(input: {
    token: string;
    amount: number;
    description?: string;
    externalReference?: string;
    idempotencyKey: string;
    customerId?: string;
    payerEmail?: string;
    paymentMethodId: string;
    paymentTypeId: string;
    /** Only the new-card checkout path needs the extra getCard round trip. */
    includeCardDetails: boolean;
  }): Promise<MpPaymentResult> {
    const sdkConfig = this.getSdkConfig();
    const amountStr = input.amount.toFixed(2);
    try {
      const orderClient = new Order(sdkConfig);
      const order = await orderClient.create({
        body: {
          type: 'online',
          processing_mode: 'automatic',
          external_reference: input.externalReference,
          total_amount: amountStr,
          description: input.description,
          payer: input.customerId
            ? { customer_id: input.customerId }
            : { email: input.payerEmail },
          transactions: {
            payments: [
              {
                amount: amountStr,
                payment_method: {
                  id: input.paymentMethodId,
                  type: input.paymentTypeId,
                  token: input.token,
                  installments: 1,
                },
              },
            ],
          },
        },
        requestOptions: { idempotencyKey: input.idempotencyKey },
      });

      const txPayment = order.transactions?.payments?.[0];
      if (!txPayment?.id) {
        throw new Error(
          'Mercado Pago did not return a transaction payment id.',
        );
      }

      let card: MpPaymentResult['card'];
      const cardId = txPayment.payment_method?.card_id;
      if (input.includeCardDetails && input.customerId && cardId) {
        // The order already charged successfully by this point — a failure
        // to fetch the card's display details afterward must not report an
        // approved payment as an outage (that would close the ChargeOrder as
        // ERROR with no recovery path, even though the money already moved).
        // rememberCard in checkout.service.ts already handles `card ===
        // undefined` by logging and skipping the save.
        try {
          const savedCard = await this.getCard(input.customerId, cardId);
          if (savedCard?.lastFourDigits !== undefined) {
            card = {
              id: savedCard.id,
              lastFourDigits: savedCard.lastFourDigits,
              paymentMethodId: savedCard.paymentMethodId,
              paymentTypeId: input.paymentTypeId,
              expirationMonth: savedCard.expirationMonth,
              expirationYear: savedCard.expirationYear,
            };
          }
        } catch (err) {
          this.logger.warn(
            `Approved order ${order.id} could not fetch card details for customer ${input.customerId}`,
            err instanceof Error ? err.stack : err,
          );
        }
      }

      return {
        id: String(txPayment.id),
        status: mapOrderStatusToPaymentStatus(order.status),
        statusDetail: order.status_detail,
        transactionAmount:
          order.total_paid_amount !== undefined
            ? Number(order.total_paid_amount)
            : undefined,
        externalReference: order.external_reference,
        mpOrderId: order.id,
        card,
      };
    } catch (err) {
      throw this.wrapError('chargeOnlineOrder', err);
    }
  }

  /**
   * Charges a previously saved card. A saved card's id cannot be charged
   * directly as a payment token — Mercado Pago requires a fresh, single-use
   * token minted from the saved card immediately before the charge, which is
   * how off-session / recurring saved-card charges work in their API. This
   * method performs both steps: mint the fresh token, then create the
   * payment with it.
   */
  async chargeSavedCard(input: ChargeSavedCardInput): Promise<MpPaymentResult> {
    const sdkConfig = this.getSdkConfig();
    const { customerId, cardId, amount, description, idempotencyKey } = input;
    let freshToken: SdkCardTokenResponse;
    try {
      const cardTokenClient = new CardToken(sdkConfig);
      freshToken = await cardTokenClient.create({
        body: { card_id: cardId, customer_id: customerId },
      });
      if (!freshToken.id) {
        throw new Error('Mercado Pago did not return a fresh card token.');
      }
    } catch (err) {
      throw this.wrapError('chargeSavedCard', err);
    }

    return this.chargeOnlineOrder({
      token: freshToken.id,
      amount,
      description,
      externalReference: input.externalReference,
      idempotencyKey,
      customerId,
      paymentMethodId: input.paymentMethodId,
      paymentTypeId: input.paymentTypeId,
      includeCardDetails: false,
    });
  }

  /**
   * Charges a card the member has just entered, using the single-use token the
   * Card Payment Brick minted in their browser. Unlike `chargeSavedCard`, no
   * token is minted here — the browser already did it, and this token cannot
   * be reused afterwards.
   *
   * A declined card resolves normally with `status: 'rejected'`; only a
   * failure to complete the call at all throws.
   */
  async chargeCardToken(input: ChargeCardTokenInput): Promise<MpPaymentResult> {
    return this.chargeOnlineOrder({
      token: input.token,
      amount: input.amount,
      description: input.description,
      externalReference: input.externalReference,
      idempotencyKey: input.idempotencyKey,
      customerId: input.customerId,
      payerEmail: input.payerEmail,
      paymentMethodId: input.paymentMethodId,
      paymentTypeId: input.paymentTypeId,
      includeCardDetails: true,
    });
  }

  async getPayment(mpPaymentId: string): Promise<MpPaymentResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const paymentClient = new Payment(sdkConfig);
      const payment = await paymentClient.get({ id: mpPaymentId });
      return this.normalizePayment(payment);
    } catch (err) {
      throw this.wrapError('getPayment', err);
    }
  }

  async refundPayment(
    mpPaymentId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<MpRefundResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const refundClient = new PaymentRefund(sdkConfig);
      const refund: SdkRefundResponse = await refundClient.create({
        payment_id: mpPaymentId,
        body: { amount },
        requestOptions: { idempotencyKey },
      });
      if (refund.id === undefined) {
        throw new Error('Mercado Pago did not return a refund id.');
      }
      return {
        id: String(refund.id),
        status: refund.status,
        amount: refund.amount,
      };
    } catch (err) {
      throw this.wrapError('refundPayment', err);
    }
  }

  /**
   * Refunds one transaction within an Orders API order — the only refund
   * path that works for a payment created by `chargeCardToken`/
   * `chargeSavedCard` (see `RefundService.issue`); the classic
   * `POST /v1/payments/{id}/refunds` endpoint `refundPayment` uses does not
   * accept an Orders API transaction id.
   */
  async refundOrder(
    orderId: string,
    transactionId: string,
    amount: number,
    idempotencyKey: string,
  ): Promise<MpRefundResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const orderClient = new Order(sdkConfig);
      const order = await orderClient.refund({
        id: orderId,
        body: {
          transactions: [{ id: transactionId, amount: amount.toFixed(2) }],
        },
        requestOptions: { idempotencyKey },
      });
      if (!order.id) {
        throw new Error('Mercado Pago did not return an order id.');
      }
      return {
        id: order.id,
        status: order.status,
        amount,
      };
    } catch (err) {
      throw this.wrapError('refundOrder', err);
    }
  }

  async createOrder(request: CreateOrderRequest): Promise<MpOrderResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const orderClient = new Order(sdkConfig);
      const config: Record<string, unknown> =
        request.type === 'point'
          ? { point: request.point }
          : { qr: request.qr };

      const body: SdkOrderCreateBody = {
        type: request.type,
        external_reference: request.externalReference,
        // In-person order types (point/qr) take the amount on the
        // transaction, not as a top-level `total_amount` — the live Orders
        // API 400s with "additionalProperties 'total_amount' not allowed"
        // if it's sent here, and separately 400s "missing properties:
        // transactions" if this is omitted. Confirmed against the real API,
        // not just the SDK's types (which allow `total_amount` because it
        // applies to `type: "online"` orders instead).
        transactions: {
          payments: [{ amount: request.totalAmount.toFixed(2) }],
        },
        expiration_time: request.expirationTime,
        description: request.description,
        // The installed SDK's `CreateOrderConfig` type only models the
        // "online" checkout config shape (statement_descriptor, online.*,
        // payment_method.*) — it has no `point` or `qr` sub-keys at all,
        // even though the real Orders API accepts both for in-person order
        // types. This SDK version's types simply lag the real API here.
        // `config` is deliberately typed as `Record<string, unknown>` above
        // rather than narrowed to the SDK's `CreateOrderConfig`, so a valid
        // `point`/`qr` body reaches Mercado Pago unmodified; TypeScript
        // accepts the assignment below without a cast because every field
        // on `CreateOrderConfig` is optional, so no assertion is needed (or
        // wanted — eslint's no-unnecessary-type-assertion would flag one).
        // The exact sub-fields inside `point`/`qr` are confirmed by a later
        // task, not this one.
        config,
      };

      const order = await orderClient.create({
        body,
        requestOptions: { idempotencyKey: request.idempotencyKey },
      });
      return this.normalizeOrder(order);
    } catch (err) {
      throw this.wrapError('createOrder', err);
    }
  }

  /**
   * Re-fetches an order by id — the authoritative source an `order`-topic
   * webhook notification must act on, never the notification body itself.
   */
  async getOrder(mpOrderId: string): Promise<MpOrderResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const orderClient = new Order(sdkConfig);
      const order = await orderClient.get({ id: mpOrderId });
      return this.normalizeOrder(order);
    } catch (err) {
      throw this.wrapError('getOrder', err);
    }
  }

  async cancelOrder(mpOrderId: string): Promise<MpOrderResult> {
    const sdkConfig = this.getSdkConfig();
    try {
      const orderClient = new Order(sdkConfig);
      const order = await orderClient.cancel({ id: mpOrderId });
      return this.normalizeOrder(order);
    } catch (err) {
      throw this.wrapError('cancelOrder', err);
    }
  }
}
