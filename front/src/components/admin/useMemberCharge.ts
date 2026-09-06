import { useEffect, useRef, useState } from 'react';
import { getPlans, getPlanDurations } from '../../services/plan.service';
import { getSubscriptionsByUser } from '../../services/subscription.service';
import {
  getPaymentsByUser,
  registerPlanCheckout,
} from '../../services/payment.service';
import {
  createChargeOrder,
  getChargeOrder,
  cancelChargeOrder,
  type ChargeOrderCreated,
} from '../../services/chargeOrder.service';
import { formatPriceDisplay, parsePriceInput } from '../../lib/currency';
import {
  CHARGE_METHODS,
  durationOptionsFor,
  findChargeFormError,
  isOrderMethod,
  resolvedPriceFor,
  summarizeCharge,
  type ChargeMethod,
  type ChargeMonths,
  type ChargeSummary,
} from './plan-charge';
import {
  POLL_INTERVAL_MS,
  hasAutoRenewedToday,
  shouldKeepPolling,
} from './charge-panel';
import type { Plan, PlanDuration } from '../../types/plan';
import type { Payment, PlanCheckoutPayload } from '../../types/payment';
import type { User } from '../../types/user';

// The live order's status/amount/qrPayload/expiresAt/newEndDate in one shape,
// so creation and every poll tick write the same object. Lifted from
// ChargePanel's old local `OrderView`, exported now that a sibling renders it.
export type OrderView = ChargeOrderCreated & { newEndDate: string | null };

// Frontend-only mirrors of the backend's single-terminal/single-caja hardware
// setup (MP_POINT_TERMINAL_ID / MP_QR_EXTERNAL_POS_ID). No backend endpoint
// exposes these, so they travel as their own Vite env vars — see
// front/.env.example — and must be kept in sync with the backend's values by
// whoever configures each deploy.
const POINT_TERMINAL_ID = import.meta.env.VITE_MP_POINT_TERMINAL_ID as
  | string
  | undefined;
const QR_EXTERNAL_POS_ID = import.meta.env.VITE_MP_QR_EXTERNAL_POS_ID as
  | string
  | undefined;

// Owns plans, the selected member's durations and current plan, the resolved
// price, the method split (cash family vs. point/qr charge orders) and the
// submit/cancel that go with it. Every async write compares against the
// member (or plan, or order) it was launched for — audit finding 2 is not
// fixed by lifting state to the section, only by this guard.
export const useMemberCharge = (
  selectedUser: User | null,
  onCharged?: (summary: ChargeSummary) => void | Promise<void>,
) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<number | ''>('');
  const [months, setMonths] = useState<ChargeMonths>(1);
  const [durations, setDurations] = useState<PlanDuration[]>([]);
  const [amountText, setAmountText] = useState('');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [method, setMethod] = useState<ChargeMethod>(CHARGE_METHODS[0].value);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printWarning, setPrintWarning] = useState<string | null>(null);

  const [orderView, setOrderView] = useState<OrderView | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Set the moment the admin picks a plan by hand. A ref, not state: the
  // subscription-default effect below reads it inside a .then() that must see
  // the LATEST value, not the one captured when the effect (re-)ran — without
  // this, choosing a plan quickly, before that fetch resolves, got silently
  // overwritten by the member's actual current plan once it landed.
  const planTouchedRef = useRef(false);

  // Polling — follows GoogleAuthButton.tsx's timer-lifecycle precedent: the
  // interval id lives in a ref, is cleared in the effect's cleanup, and every
  // async callback checks isMountedRef before touching state so a poll that
  // resolves after unmount is a no-op.
  const pollingRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current !== null) {
        window.clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Every setState lives in an async callback, so the effect below only starts
  // the request instead of updating state while React renders. Plans are not
  // scoped to anything the admin can change mid-flight, so no staleness guard
  // is needed here.
  useEffect(() => {
    void getPlans()
      .then((data) => {
        setPlans(data);
        setPlansError(null);
      })
      .catch((err: unknown) => {
        setPlansError(
          err instanceof Error ? err.message : 'No se pudieron cargar los planes.',
        );
      });
  }, []);

  // Default to the member's current plan. A response that lands after the
  // admin has moved to another member must not write anything — that race is
  // what used to leave the old form stuck on a spinner forever.
  useEffect(() => {
    if (!selectedUser) return;
    let isCurrent = true;
    void getSubscriptionsByUser(selectedUser.id)
      .then((subs) => {
        if (!isCurrent || planTouchedRef.current) return;
        const active = subs.find(
          (s) => s.state?.toLowerCase() === 'activa' && !s.deleted,
        );
        setPlanId(active?.planId ?? '');
        setMonths(1);
      })
      .catch((err: unknown) => {
        if (!isCurrent || planTouchedRef.current) return;
        console.warn('Could not read the member current plan', err);
        setPlanId('');
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedUser]);

  // The advance-payment warning's data source: the backend has no flag for
  // "this membership was already auto-renewed today", so the panel infers it
  // from the member's payment history — see hasAutoRenewedToday. Same
  // staleness guard as the effect above; a response that lands after the admin
  // has moved to another member must not write anything.
  useEffect(() => {
    if (!selectedUser) return;
    let isCurrent = true;
    void getPaymentsByUser(selectedUser.id)
      .then((data) => {
        if (!isCurrent) return;
        setPayments(data);
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        console.warn('Could not read the member payment history', err);
        setPayments([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [selectedUser]);

  // Durations belong to the plan, so they reload on the plan and reset the
  // term — a 6-month term left over from another plan would resolve to null.
  useEffect(() => {
    // Resets synchronously on every plan change, including planId becoming
    // empty — a 6-month term left over from another plan would otherwise
    // resolve to null once durations reload for the new plan.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMonths(1);
    if (!planId) {
      // Resets synchronously — no request is in flight here to gate this on.
      setDurations([]);
      return;
    }
    let isCurrent = true;
    void getPlanDurations(planId)
      .then((data) => {
        if (!isCurrent) return;
        setDurations(data);
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        console.warn('Could not load the plan durations', err);
        setDurations([]);
      });
    return () => {
      isCurrent = false;
    };
  }, [planId]);

  // Exposed to the form instead of the raw setter, so picking a plan by hand
  // marks planTouchedRef before the state update — no gap for the default
  // effect's response to slip in between the two.
  const setPlanIdTouched = (id: number | '') => {
    planTouchedRef.current = true;
    setPlanId(id);
  };

  const plan = plans.find((p) => p.id === planId) ?? null;
  const options = durationOptionsFor(plan, durations);
  const resolvedPrice = resolvedPriceFor(plan, durations, months);
  const autoRenewedToday = hasAutoRenewedToday(payments, new Date());

  // Recomputed unconditionally, never left stale: the old form kept the
  // previous subscription's amount when the new one had no price. Satisfying
  // react-hooks/set-state-in-effect here needs a data layer, not a local
  // edit, so the warning is accepted the same way the other sites carrying
  // it are.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAmountText(resolvedPrice != null ? formatPriceDisplay(resolvedPrice) : '');
  }, [resolvedPrice]);

  const stopPolling = (): void => {
    if (pollingRef.current !== null) {
      window.clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  };

  const pollOnce = (id: number): void => {
    void getChargeOrder(id)
      .then((status) => {
        if (!isMountedRef.current) return;
        setOrderView((prev) => (prev && prev.id === id ? { ...prev, ...status } : prev));
        if (!shouldKeepPolling(status.status, status.expiresAt, new Date())) {
          stopPolling();
          // Point/QR only count as "charged" once the webhook-driven poll
          // reaches 'pagada' — see the cash branch of submit() below, which
          // fires onCharged immediately instead.
          if (status.status === 'pagada') {
            // The form is disabled while an order is pendiente, so plan, months
            // and amount still hold exactly what the order was created from.
            if (plan) {
              void onCharged?.(
                summarizeCharge(plan, months, parsePriceInput(amountText), method),
              );
            }
          }
        }
      })
      .catch((err: unknown) => {
        if (!isMountedRef.current) return;
        stopPolling();
        setOrderError(
          err instanceof Error
            ? err.message
            : 'No se pudo consultar el estado del cobro.',
        );
      });
  };

  const startPolling = (id: number): void => {
    stopPolling();
    pollingRef.current = window.setInterval(() => pollOnce(id), POLL_INTERVAL_MS);
  };

  const cancelOrder = async (): Promise<void> => {
    if (!orderView) return;
    const id = orderView.id;
    stopPolling();
    try {
      await cancelChargeOrder(id);
      if (!isMountedRef.current) return;
      setOrderView(null);
    } catch (err) {
      if (!isMountedRef.current) return;
      setOrderError(
        err instanceof Error ? err.message : 'No se pudo cancelar el cobro.',
      );
    }
  };

  // Clears a finished order so the admin can charge the SAME member again
  // without going back through the search — the panel's "Nuevo cobro" (after
  // 'pagada') and "Reintentar" (after 'cancelada'/'expirada'/'error') buttons.
  // cancelOrder only covers an order that is still 'pendiente'.
  const resetOrder = (): void => {
    stopPolling();
    setOrderView(null);
    setOrderError(null);
  };

  const submit = async (userId: number): Promise<void> => {
    setFormError(null);
    setSuccess(null);
    setPrintWarning(null);

    const validationError = findChargeFormError({ planId, months, amountText });
    if (validationError) {
      setFormError(validationError);
      return;
    }

    const amount = parsePriceInput(amountText);

    // Point and QR settle asynchronously: the order is armed here and the
    // subscription is only created once the webhook confirms it, so this
    // branch reports "waiting at the terminal", never "charged".
    if (isOrderMethod(method)) {
      const collectionPointId =
        method === 'point' ? POINT_TERMINAL_ID : QR_EXTERNAL_POS_ID;
      if (!collectionPointId) {
        setFormError('Ese método no está configurado en el panel.');
        return;
      }

      setIsCreatingOrder(true);
      try {
        const created = await createChargeOrder({
          userId,
          planId: Number(planId),
          months,
          amount,
          method,
          collectionPointId,
        });
        setOrderView({ ...created, newEndDate: null });
        startPolling(created.id);
      } catch (err) {
        setOrderError(
          err instanceof Error ? err.message : 'No se pudo iniciar el cobro.',
        );
      } finally {
        setIsCreatingOrder(false);
      }
      return;
    }

    setIsSaving(true);
    try {
      const payment = await registerPlanCheckout({
        userId,
        planId: Number(planId),
        months,
        amount,
        payMethod: method as PlanCheckoutPayload['payMethod'],
      });
      const summary = summarizeCharge(plan!, months, amount, method);
      setSuccess(
        `Cobro de $${formatPriceDisplay(amount)} registrado — ${plan?.name ?? 'plan'}, ${summary.termLabel}.`,
      );
      if (payment.printStatus === 'error') {
        setPrintWarning(
          'El cobro se registró, pero no se pudo imprimir el comprobante en la terminal.',
        );
      }
      await onCharged?.(summary);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo registrar el cobro.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return {
    plans, plansError, planId, setPlanId: setPlanIdTouched, months, setMonths,
    options, resolvedPrice, amountText, setAmountText, autoRenewedToday,
    method, setMethod, orderView, isCreatingOrder, orderError,
    isSaving, formError, success, printWarning, submit, cancelOrder, resetOrder,
  };
};
