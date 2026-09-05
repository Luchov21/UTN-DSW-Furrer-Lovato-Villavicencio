import type {
  CheckoutPayload,
  CheckoutPreference,
  CheckoutResult,
  CheckoutStatus,
  CheckoutSummary,
} from '../types/checkout';
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

export const createCheckoutPreference = async (
  planId: number,
  months: number,
): Promise<CheckoutPreference> => {
  try {
    const { data } = await api.post<CheckoutPreference>(
      '/checkout/preference',
      { planId, months },
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
  months: number;
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
