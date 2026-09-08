import type {
  CheckoutPayload,
  CheckoutPreference,
  CheckoutResult,
  CheckoutStatus,
  CheckoutSummary,
} from '../types/checkout';
import type { PlanChangeQuote } from '../types/plan-change';
import { getApiErrorMessage } from './api-error';
import api from './api';

// Public on the backend: a guest reads this before they have an account.
export const getCheckoutSummary = async (
  planId: number,
  months: number,
): Promise<CheckoutSummary> => {
  try {
    const { data } = await api.get<CheckoutSummary>('/checkout/summary', {
      params: { planId, months },
    });
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo calcular el precio del plan.'),
      { cause: error },
    );
  }
};

// A declined card comes back as a 200 with status 'rejected', so it resolves
// here rather than throwing — the caller renders a banner instead of an error
// screen, and keeps the member's plan selection on the page.
export const submitCheckout = async (
  payload: CheckoutPayload,
): Promise<CheckoutResult> => {
  try {
    const { data } = await api.post<CheckoutResult>('/checkout', payload);
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo procesar el pago.'),
      { cause: error },
    );
  }
};

// `months` is omitted (not just falsy) for a plan-change preference: the
// backend DTO only validates it in term mode, and axios drops an `undefined`
// property from the JSON body entirely rather than sending a meaningless one.
export const createCheckoutPreference = async (
  planId: number,
  months?: number,
  mode?: CheckoutPayload['mode'],
): Promise<CheckoutPreference> => {
  try {
    const { data } = await api.post<CheckoutPreference>(
      '/checkout/preference',
      { planId, months, mode },
    );
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo preparar el pago con Mercado Pago.'),
      { cause: error },
    );
  }
};

// Throwing here is load-bearing: PaymentForm hands this promise straight to
// the Brick, and a rejection is what stops it redirecting to Mercado Pago
// with nothing armed on our side.
export const armCheckout = async (payload: {
  planId: number;
  months?: number;
  mode?: CheckoutPayload['mode'];
  externalReference: string;
}): Promise<void> => {
  try {
    await api.post('/checkout/arm', payload);
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo iniciar el pago. Probá de nuevo.'),
      { cause: error },
    );
  }
};

// Self-service: the priced, member-specific quote for changing to `planId`.
// Requires an authenticated member — GET /checkout/summary above is the
// public, no-subscription-needed equivalent for a term purchase.
export const getPlanChangeQuote = async (
  planId: number,
): Promise<PlanChangeQuote> => {
  try {
    const { data } = await api.get<PlanChangeQuote>('/checkout/plan-change', {
      params: { planId },
    });
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo calcular el cambio de plan.'),
      { cause: error },
    );
  }
};

// The front desk's counterpart to getPlanChangeQuote: an admin quoting ANY
// member's plan change by id, standing at the counter — see
// GET /checkout/plan-change/member/:id (@Auth(Role.ADMIN)). Unlike the
// self-service call above, the member never authenticates here; the admin's
// own token is what's on the request.
export const getPlanChangeQuoteForMember = async (
  memberId: number,
  planId: number,
): Promise<PlanChangeQuote> => {
  try {
    const { data } = await api.get<PlanChangeQuote>(
      `/checkout/plan-change/member/${memberId}`,
      { params: { planId } },
    );
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo calcular el cambio de plan.'),
      { cause: error },
    );
  }
};

// Adapts a plan-change quote into the CheckoutSummary shape the checkout
// pages' OrderSummary rail already knows how to render, so those pages don't
// need a second summary component for one field. Every displayed number is
// `quote.amount` verbatim — never recomputed here — because the backend
// (resolveCharge) is the only place allowed to price a plan change. Throws
// for an ineligible quote so callers can treat it exactly like a summary
// fetch failure (same catch branch, same "couldn't price this" error path)
// instead of rendering a payable amount for a change the backend would
// refuse.
//
// `isOneTimeAdjustment: true` is load-bearing, not cosmetic: without it
// OrderSummary would render `quote.amount` — a one-time proration top-up —
// as "$X / mes" and "Subtotal (1 × $X)", which reads as the member's new
// recurring monthly price. It isn't; they keep their current plan's cycle
// price going forward. See OrderSummary.tsx for the rendering this flips.
export const planChangeQuoteToSummary = (
  quote: PlanChangeQuote,
): CheckoutSummary => {
  if (!quote.eligible) {
    throw new Error(quote.message ?? 'No se puede aplicar este cambio de plan.');
  }
  return {
    planId: quote.planId,
    planName: quote.planName,
    months: 1,
    monthlyPrice: quote.amount,
    subtotal: quote.amount,
    discount: 0,
    total: quote.amount,
    currency: 'ARS',
    availableMonths: [],
    isOneTimeAdjustment: true,
  };
};

export const getCheckoutStatus = async (
  externalReference: string,
): Promise<CheckoutStatus> => {
  try {
    const { data } = await api.get<CheckoutStatus>('/checkout/status', {
      params: { externalReference },
    });
    return data;
  } catch (error) {
    throw new Error(
      getApiErrorMessage(error, 'No se pudo confirmar el estado de tu pago.'),
      { cause: error },
    );
  }
};
