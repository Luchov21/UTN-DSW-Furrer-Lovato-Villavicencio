import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CheckoutLayout from '../../components/checkout/CheckoutLayout';
import PaymentSuccess from '../../components/checkout/PaymentSuccess';
import DeclineBanner from '../../components/checkout/DeclineBanner';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import { checkoutWalletUrl } from '../../components/checkout/useCheckoutParams';
import {
  POLL_ATTEMPTS,
  POLL_INTERVAL_MS,
  readReturnReference,
} from '../../components/checkout/checkout-return';
import { getCheckoutStatus } from '../../services/checkout.service';
import type { CheckoutResult, CheckoutStatus } from '../../types/checkout';

// Mercado Pago's own status/collection_status query parameters are never
// read here — see checkout-return.ts. This page only ever claims success
// after our own /checkout/status confirms it (spec D6).
function CheckoutReturn() {
  const location = useLocation();
  const reference = readReturnReference(location.search);

  const [settled, setSettled] = useState<CheckoutStatus | null>(null);

  useEffect(() => {
    // No usable reference: there is nothing to poll, so the member sees the
    // same "still confirming" card as a payment that never settles — never
    // success.
    if (!reference) return undefined;

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      attempts += 1;
      try {
        const status = await getCheckoutStatus(reference);
        if (cancelled) return;
        if (status.status !== 'pending') {
          setSettled(status);
          clearInterval(intervalId);
          return;
        }
      } catch (error) {
        // A transient 5xx mid-settlement should not strand the member on an
        // error screen — log it and let the next attempt run.
        console.error('Could not confirm the checkout status', error);
      }
      if (attempts >= POLL_ATTEMPTS) {
        clearInterval(intervalId);
      }
    };

    const intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS);
    void poll();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [reference]);

  if (settled?.status === 'approved') {
    const result: CheckoutResult = {
      status: 'approved',
      paymentId: settled.paymentId,
      newEndDate: settled.newEndDate,
      planName: settled.planName,
      amount: settled.amount,
      months: settled.months,
    };
    return (
      <CheckoutLayout
        title="Pago confirmado"
        subtitle="Gracias por entrenar con nosotros."
        summary={null}
      >
        <PaymentSuccess result={result} showAddCardNudge />
      </CheckoutLayout>
    );
  }

  if (settled?.status === 'rejected') {
    return (
      <CheckoutLayout
        title="No pudimos confirmar tu pago"
        subtitle="Mercado Pago rechazó el pago."
        summary={null}
      >
        <Card className="hover:translate-y-0 hover:shadow-lg">
          <div className="space-y-5">
            <DeclineBanner result={{ status: 'rejected' }} />
            {/* No plan or term survives the trip through Mercado Pago's
                back_urls (see checkout-preference.rules.ts), so the retry
                sends the member back to pick a plan again. */}
            <Button href={checkoutWalletUrl(null, 1)} className="w-full">
              Volver a intentar
            </Button>
          </div>
        </Card>
      </CheckoutLayout>
    );
  }

  return (
    <CheckoutLayout
      title="Pagá tu membresía"
      subtitle="Confirmando tu pago con Mercado Pago."
      summary={null}
    >
      <Card className="hover:translate-y-0 hover:shadow-lg">
        <h2 className="font-display text-lg font-semibold text-text">
          Estamos confirmando tu pago
        </h2>
        <p className="mt-2 font-body text-sm text-text-muted">
          Mercado Pago todavía no nos avisó el resultado. Apenas se acredite
          vas a recibir el comprobante por email y tu plan queda activo — no
          hace falta que vuelvas a pagar.
        </p>
      </Card>
    </CheckoutLayout>
  );
}

export default CheckoutReturn;
