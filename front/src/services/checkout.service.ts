import type {
  CheckoutPayload,
  CheckoutResult,
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
