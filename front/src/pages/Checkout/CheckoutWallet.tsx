import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import CheckoutLayout from '../../components/checkout/CheckoutLayout';
import CardForm from '../../components/checkout/CardForm';
import PaymentMethodChoice from '../../components/checkout/PaymentMethodChoice';
import TermsAcceptance from '../../components/checkout/TermsAcceptance';
import PaymentSuccess from '../../components/checkout/PaymentSuccess';
import DeclineBanner from '../../components/checkout/DeclineBanner';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import FormAlert from '../../components/common/FormAlert';
import { readCheckoutParams } from '../../components/checkout/useCheckoutParams';
import {
  getCheckoutSummary,
  submitCheckout,
} from '../../services/checkout.service';
import { getMySavedCard } from '../../services/savedCard.service';
import { formatPriceDisplay } from '../../lib/currency';
import type { CheckoutResult, CheckoutSummary } from '../../types/checkout';
import type { SavedCard } from '../../types/savedCard';

function CheckoutWallet() {
  const navigate = useNavigate();
  const location = useLocation();
  const { planId, months } = readCheckoutParams(location.search);

  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [card, setCard] = useState<SavedCard | null>(null);
  const [useSavedCard, setUseSavedCard] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [saveCard, setSaveCard] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaying, setIsPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Drives PaymentSuccess when approved, DeclineBanner otherwise.
  const [result, setResult] = useState<CheckoutResult | null>(null);

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
    Promise.allSettled([getCheckoutSummary(planId, months), getMySavedCard()])
      .then(([summaryRes, cardRes]) => {
        if (summaryRes.status === 'fulfilled') {
          setSummary(summaryRes.value);
        } else {
          setError('No se pudo calcular el precio del plan.');
        }
        const savedCard =
          cardRes.status === 'fulfilled' ? cardRes.value : null;
        setCard(savedCard);
        setUseSavedCard(Boolean(savedCard));
      })
      .finally(() => setIsLoading(false));
  }, [planId, months, navigate]);

  const pay = useCallback(
    async (cardToken?: string) => {
      if (!planId) return;
      // Reentrancy guard: the Brick's own submit-button lock releases as
      // soon as onToken (synchronous) returns, well before this async call
      // finishes — without this check a double-click can fire two
      // concurrent charges.
      if (isPaying) return;
      setIsPaying(true);
      setError(null);
      try {
        const response = await submitCheckout({
          planId,
          months,
          cardToken,
          useSavedCard: useSavedCard || undefined,
          saveCard: cardToken ? saveCard : undefined,
          acceptedTerms: true,
        });
        setResult(response);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'No se pudo procesar el pago.',
        );
      } finally {
        setIsPaying(false);
      }
    },
    [planId, months, useSavedCard, saveCard, isPaying],
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
      isBusy={isPaying}
    >
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="hover:translate-y-0 hover:shadow-lg">
          <div className="space-y-5">
            <FormAlert type="error" message={error} />

            {/* The 'approved' case already returned above, so anything
                reaching here is a decline or an in-process payment. */}
            {result && <DeclineBanner result={result} />}

            <PaymentMethodChoice
              card={card}
              useSavedCard={useSavedCard}
              onChange={setUseSavedCard}
              disabled={isPaying}
            />

            {!useSavedCard && summary && (
              termsAccepted ? (
                <CardForm
                  amount={summary.total}
                  onToken={(token) => void pay(token)}
                  onError={setError}
                  isBusy={isPaying}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">
                  Aceptá los Términos y Condiciones y el Reglamento de Uso para
                  ingresar los datos de tu tarjeta.
                </div>
              )
            )}

            <TermsAcceptance
              acceptedTerms={acceptedTerms}
              acceptedRules={acceptedRules}
              saveCard={saveCard}
              onChange={handleChange}
              disabled={isPaying}
            />

            {useSavedCard && summary && (
              <Button
                className="w-full"
                disabled={!canPay}
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
