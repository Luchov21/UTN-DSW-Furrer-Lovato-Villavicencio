import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import CheckoutLayout from '../../components/checkout/CheckoutLayout';
import AccountStep from '../../components/checkout/AccountStep';
import FormAlert from '../../components/common/FormAlert';
import {
  checkoutWalletUrl,
  readCheckoutParams,
} from '../../components/checkout/useCheckoutParams';
import { getCheckoutSummary } from '../../services/checkout.service';
import { useAuth } from '../../context/useAuth';
import type { CheckoutSummary } from '../../types/checkout';

function Checkout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isProfileComplete } = useAuth();
  const { planId, months } = readCheckoutParams(location.search);

  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const walletUrl = checkoutWalletUrl(planId, months);

  const loadSummary = useCallback(
    (nextMonths: number) => {
      if (!planId) return;
      getCheckoutSummary(planId, nextMonths)
        .then(setSummary)
        .catch((err: unknown) =>
          setError(
            err instanceof Error
              ? err.message
              : 'No se pudo calcular el precio del plan.',
          ),
        )
        .finally(() => setIsLoading(false));
    },
    [planId, setSummary, setError, setIsLoading],
  );

  useEffect(() => {
    // A checkout with no plan has nothing to sell; send them back to pick one
    // rather than rendering an empty summary.
    if (!planId) {
      navigate('/membership', { replace: true });
      return;
    }
    loadSummary(months);
  }, [planId, months, loadSummary, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!isProfileComplete) {
      navigate(`/complete-profile?returnTo=${encodeURIComponent(walletUrl)}`, {
        replace: true,
      });
      return;
    }
    navigate(walletUrl, { replace: true });
  }, [isAuthenticated, isProfileComplete, navigate, walletUrl]);

  const handleMonthsChange = (nextMonths: number) => {
    navigate(`/checkout?plan=${planId ?? ''}&months=${nextMonths}`, {
      replace: true,
    });
  };

  return (
    <CheckoutLayout
      title="Finalizá tu membresía"
      subtitle="Creá tu cuenta para continuar con el pago. Te lleva menos de un minuto."
      summary={summary}
      onMonthsChange={handleMonthsChange}
    >
      <FormAlert type="error" message={error} />
      {isLoading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <AccountStep
          onAuthenticated={() => navigate(walletUrl)}
          onIncompleteProfile={() =>
            navigate(
              `/complete-profile?returnTo=${encodeURIComponent(walletUrl)}`,
            )
          }
        />
      )}
    </CheckoutLayout>
  );
}

export default Checkout;
