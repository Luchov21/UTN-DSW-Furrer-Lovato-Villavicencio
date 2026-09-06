import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import CheckoutLayout from '../../components/checkout/CheckoutLayout';
import PaymentForm from '../../components/checkout/PaymentForm';
import DurationSelector from '../../components/checkout/DurationSelector';
import PaymentMethodChoice from '../../components/checkout/PaymentMethodChoice';
import TermsAcceptance from '../../components/checkout/TermsAcceptance';
import PaymentSuccess from '../../components/checkout/PaymentSuccess';
import DeclineBanner from '../../components/checkout/DeclineBanner';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormAlert from '../../components/common/FormAlert';
import {
  checkoutWalletUrl,
  readCheckoutParams,
} from '../../components/checkout/useCheckoutParams';
import {
  armCheckout,
  createCheckoutPreference,
  getCheckoutSummary,
  submitCheckout,
} from '../../services/checkout.service';
import { getMySavedCard } from '../../services/savedCard.service';
import { formatPriceDisplay } from '../../lib/currency';
import type {
  CheckoutPreference,
  CheckoutResult,
  CheckoutSummary,
} from '../../types/checkout';
import type { SavedCard } from '../../types/savedCard';

function CheckoutWallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const { planId, months } = readCheckoutParams(location.search);
  // Identifies which (planId, months) pair the page is currently showing
  // data for. Compared against `loadedFor` below to derive `isLoading` — see
  // that comparison for why this can't just be a manually toggled boolean.
  const requestKey = `${planId}:${months}`;

  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [preference, setPreference] = useState<CheckoutPreference | null>(null);
  // The `months` the currently-loaded preference was actually created for —
  // set in the same effect run as `preference`, never derived from the live
  // `months` param. handleWalletSubmit compares this against the current
  // `months` to detect a duration change that outran the reload it triggers
  // (see isLoading below): without this, arming would send the CURRENT
  // months alongside an externalReference priced for the OLD one.
  const [preferenceForMonths, setPreferenceForMonths] = useState<number | null>(
    null,
  );
  const [card, setCard] = useState<SavedCard | null>(null);
  const [useSavedCard, setUseSavedCard] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  // The (planId, months) pair the currently-held summary/card/preference were
  // loaded for, set once the load effect's fetches for that pair land. `null`
  // until the first load finishes.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  // Derived, not a separately-toggled state: a duration change updates
  // `requestKey` (from the URL) synchronously, before the load effect's
  // refetch resolves, so comparing the two is what makes the page fall back
  // to the loading UI — hiding the Brick — for the entire reload window
  // rather than only for the very first load. A manually-toggled boolean
  // reset to `true` at the top of the effect would do the same thing, but
  // React's set-state-in-effect lint rule flags a synchronous setState in an
  // effect body, and there is no async gap to hide it behind here.
  const isLoading = loadedFor !== requestKey;
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drives PaymentSuccess when approved, DeclineBanner otherwise.
  const [result, setResult] = useState<CheckoutResult | null>(null);

  // A ref, not the isPaying state, because state is not updated
  // synchronously: two clicks landing before React re-renders would both read
  // isPaying === false and both start a charge. That is a real double charge
  // on the saved-card path, whose idempotency key is minted fresh per attempt
  // (checkout-<externalReference>) — the new-card path is already covered by
  // its key being derived from the single-use token, which Mercado Pago
  // dedupes on its own. Set before any await, cleared in the finally.
  const isPayingRef = useRef(false);

  // Split from canPay: whether the Brick/pay-button unlock is a function of
  // the checkboxes alone, so it stays true while a payment is in flight
  // instead of flipping the "aceptá los términos" hint back on mid-submit.
  const termsAccepted = acceptedTerms && acceptedRules;
  const canPay = termsAccepted && !isPaying;

  useEffect(() => {
    if (!planId) {
      navigate('/membership', { replace: true });
      return;
    }
    Promise.allSettled([
      getCheckoutSummary(planId, months),
      getMySavedCard(),
      createCheckoutPreference(planId, months),
    ])
      .then(([summaryRes, cardRes, preferenceRes]) => {
        if (summaryRes.status === 'fulfilled') {
          setSummary(summaryRes.value);
        } else {
          setError('No se pudo calcular el precio del plan.');
        }
        if (cardRes.status === 'rejected') {
          // Not fatal: the member can still pay with a new card. But mapping
          // the failure straight to null makes a broken saved-card endpoint
          // look exactly like "this member has no card", so say which one it
          // was — same pattern as ResumenTab's allSettled handler.
          console.warn(
            'Could not read the saved card for the checkout',
            cardRes.reason,
          );
        }
        const savedCard = cardRes.status === 'fulfilled' ? cardRes.value : null;
        setCard(savedCard);
        setUseSavedCard(Boolean(savedCard));

        if (preferenceRes.status === 'fulfilled') {
          setPreference(preferenceRes.value);
          setPreferenceForMonths(months);
        } else {
          // Not fatal, and deliberately not surfaced as an error: the Brick
          // renders cards only without a preferenceId, so the member can
          // still pay. An error banner would explain a missing option they
          // may never have wanted.
          console.warn(
            'Could not create the Mercado Pago preference',
            preferenceRes.reason,
          );
          setPreference(null);
          setPreferenceForMonths(null);
        }
      })
      // Marks THIS run's (planId, months) as loaded, not just "loading over".
      // A duration change updates `requestKey` synchronously (see above) and
      // re-runs this effect; until this line's `requestKey` — captured by
      // this closure at the top of this render — reaches `loadedFor`,
      // `isLoading` stays true and the Brick stays hidden.
      .finally(() => setLoadedFor(requestKey));
  }, [planId, months, navigate, requestKey]);

  const pay = useCallback(
    async (card?: {
      token: string;
      paymentMethodId: string;
      paymentTypeId: string;
    }) => {
      if (!planId) return;
      // Reentrancy guard: the Brick's own submit-button lock releases as
      // soon as onToken (synchronous) returns, well before this async call
      // finishes — without this check a double-click can fire two
      // concurrent charges. See isPayingRef on why this is a ref.
      if (isPayingRef.current) return;
      isPayingRef.current = true;
      setIsPaying(true);
      setError(null);
      try {
        const response = await submitCheckout({
          planId,
          months,
          cardToken: card?.token,
          paymentMethodId: card?.paymentMethodId,
          paymentTypeId: card?.paymentTypeId,
          useSavedCard: useSavedCard || undefined,
          saveCard: card ? saveCard : undefined,
          acceptedTerms: true,
        });
        setResult(response);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No se pudo procesar el pago.',
        );
      } finally {
        isPayingRef.current = false;
        setIsPaying(false);
      }
    },
    [planId, months, useSavedCard, saveCard],
  );

  // A charge in flight must not be abandoned by a stray back/refresh.
  useEffect(() => {
    if (!isPaying) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isPaying]);

  const handleChange = (
    field: 'terms' | 'rules' | 'saveCard',
    value: boolean,
  ) => {
    if (field === 'terms') setAcceptedTerms(value);
    if (field === 'rules') setAcceptedRules(value);
    if (field === 'saveCard') setSaveCard(value);
  };

  // Changing the term re-prices the purchase, so it navigates rather than
  // setting state: the plan and term live in the query string (see
  // useCheckoutParams), and the load effect below re-runs off them.
  const handleMonthsChange = (nextMonths: number) => {
    navigate(checkoutWalletUrl(planId, nextMonths), { replace: true });
  };

  // Arms the charge order, then lets the Brick redirect. Rejecting stops the
  // redirect: Mercado Pago must never be able to charge against a reference
  // nothing on our side resolves.
  const handleWalletSubmit = useCallback(async () => {
    if (!planId || !preference || !summary) {
      throw new Error('No se pudo iniciar el pago con Mercado Pago.');
    }
    // Safety net for the window opened by a duration change: navigating to a
    // new `months` re-triggers the load effect (see isLoading there), which
    // is what actually keeps the Brick from rendering against stale data.
    // This check exists in case that gate has a gap this file's author
    // didn't anticipate — e.g. a state-batching edge case where the Brick
    // fires onWalletSubmit before isLoading flips. `preferenceForMonths` is
    // the `months` this preference (and its externalReference) was actually
    // created for; comparing it against the CURRENT `months` — the value
    // about to be sent to armCheckout — catches exactly the race the bug
    // report describes. `preference.amount === summary.total` would not:
    // both are always set together from the same (planId, months) pair, so
    // they can never disagree with each other.
    if (preferenceForMonths !== months) {
      const message = 'Esperá un momento y volvé a intentar el pago.';
      setError(message);
      throw new Error(message);
    }
    setError(null);
    try {
      await armCheckout({
        planId,
        months,
        externalReference: preference.externalReference,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'No se pudo iniciar el pago.';
      setError(message);
      throw err;
    }
  }, [planId, months, preference, summary, preferenceForMonths]);

  if (result?.status === 'approved') {
    return (
      <CheckoutLayout
        title="Pago confirmado"
        subtitle="Gracias por entrenar con nosotros."
        summary={summary}
      >
        <PaymentSuccess result={result} />
      </CheckoutLayout>
    );
  }

  return (
    <CheckoutLayout
      title="Pagá tu membresía"
      subtitle="Ingresá los datos de tu tarjeta. El cobro se procesa a través de Mercado Pago."
      summary={summary}
    >
      {/* Only the very first load — before there's anything to show at all —
          blanks the whole card. A duration change re-fetches the summary
          and preference for the new months, but the card stays mounted with
          its previous (still valid to look at) contents; only the payment
          form area below falls back to an inline spinner while that finishes,
          so picking a duration doesn't blank the whole page. */}
      {!summary ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="hover:translate-y-0 hover:shadow-lg">
          <div className="space-y-5">
            <DurationSelector
              summary={summary}
              selectedMonths={months}
              onChange={handleMonthsChange}
              disabled={isPaying || isLoading}
            />

            <FormAlert type="error" message={error} />

            {/* The 'approved' case already returned above, so anything
                reaching here is a decline or an in-process payment. */}
            {result && <DeclineBanner result={result} />}

            <PaymentMethodChoice
              card={card}
              useSavedCard={useSavedCard}
              onChange={setUseSavedCard}
              disabled={isPaying || isLoading}
            />

            {!useSavedCard &&
              (termsAccepted ? (
                isLoading ? (
                  <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-background">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <PaymentForm
                    // Remounts when the price or the preference changes: a
                    // Brick left mounted across a duration switch would
                    // tokenize against the amount it was initialized with.
                    key={`${summary.total}-${preference?.preferenceId ?? 'cards'}`}
                    amount={summary.total}
                    preferenceId={preference?.preferenceId}
                    onCardToken={(card) => void pay(card)}
                    onWalletSubmit={handleWalletSubmit}
                    onError={setError}
                    isBusy={isPaying}
                  />
                )
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">
                  Aceptá los Términos y Condiciones y el Reglamento de Uso para
                  elegir cómo querés pagar.
                </div>
              ))}

            <TermsAcceptance
              acceptedTerms={acceptedTerms}
              acceptedRules={acceptedRules}
              saveCard={saveCard}
              onChange={handleChange}
              disabled={isPaying || isLoading}
            />

            {useSavedCard && (
              <Button
                className="w-full"
                disabled={!canPay || isLoading}
                title={
                  canPay
                    ? undefined
                    : 'Tenés que aceptar los términos y el reglamento para continuar.'
                }
                onClick={() => void pay()}
              >
                {isPaying
                  ? 'Procesando tu pago...'
                  : `Pagar $${formatPriceDisplay(summary.total)}`}
              </Button>
            )}

            {!termsAccepted && (
              <p className="text-xs text-text-muted">
                Tenés que aceptar los Términos y Condiciones y el Reglamento de
                Uso para continuar.
              </p>
            )}
          </div>
        </Card>
      )}
    </CheckoutLayout>
  );
}

export default CheckoutWallet;
