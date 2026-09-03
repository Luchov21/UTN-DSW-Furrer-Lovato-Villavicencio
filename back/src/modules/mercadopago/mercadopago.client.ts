import { Injectable } from '@nestjs/common';
import MpSdkConfig, {
  CardToken,
  Customer,
  Order,
  Payment,
  PaymentRefund,
} from 'mercadopago';
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
  expirationMonth?: number;
  expirationYear?: number;
}

export interface ChargeSavedCardInput {
  customerId: string;
  cardId: string;
  /** Amount to charge, in the account's currency units (e.g. ARS, not cents). */
  amount: number;
  description?: string;
  idempotencyKey: string;
}

export interface ChargeCardTokenInput {
  token: string;
  /** Amount to charge, in the account's currency units (e.g. ARS, not cents). */
  amount: number;
  description?: string;
  /** Maps the payment back to its ChargeOrder if the local write fails. */
  externalReference: string;
  idempotencyKey: string;
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
}

export interface MpRefundResult {
  id: string;
  status?: string;
  amount?: number;
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
    return {
      id: String(payment.id),
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      externalReference: payment.external_reference,
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
    try {
      const cardTokenClient = new CardToken(sdkConfig);
      const freshToken: SdkCardTokenResponse = await cardTokenClient.create({
        body: { card_id: cardId, customer_id: customerId },
      });
      if (!freshToken.id) {
        throw new Error('Mercado Pago did not return a fresh card token.');
      }

      const paymentClient = new Payment(sdkConfig);
      const payment = await paymentClient.create({
        body: {
          transaction_amount: amount,
          token: freshToken.id,
          description,
          payer: { type: 'customer', id: customerId },
          installments: 1,
          capture: true,
        },
        requestOptions: { idempotencyKey },
      });
      return this.normalizePayment(payment);
    } catch (err) {
      throw this.wrapError('chargeSavedCard', err);
    }
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
    const sdkConfig = this.getSdkConfig();
    const {
      token,
      amount,
      description,
      externalReference,
      idempotencyKey,
      customerId,
      payerEmail,
    } = input;
    try {
      const paymentClient = new Payment(sdkConfig);
      const payment = await paymentClient.create({
        body: {
          transaction_amount: amount,
          token,
          description,
          external_reference: externalReference,
          payer: customerId
            ? { type: 'customer', id: customerId }
            : { email: payerEmail },
          installments: 1,
          capture: true,
        },
        requestOptions: { idempotencyKey },
      });
      return this.normalizePayment(payment);
    } catch (err) {
      throw this.wrapError('chargeCardToken', err);
    }
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
