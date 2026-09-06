import Card from '../common/Card';
import Button from '../common/Button';
import { formatDateOnly } from '../../lib/date';
import { formatPriceDisplay } from '../../lib/currency';
import type { CheckoutResult } from '../../types/checkout';

interface PaymentSuccessProps {
  result: CheckoutResult;
  /**
   * Shown after a Mercado Pago account payment, which produces no card and so
   * cannot turn on auto-renewal. Saying nothing would leave a member who
   * wanted it wondering why it did not happen.
   */
  showAddCardNudge?: boolean;
}

const PaymentSuccess = ({ result, showAddCardNudge }: PaymentSuccessProps) => (
  <Card className="text-center hover:translate-y-0 hover:shadow-lg">
    {/* Drawn with stroke-dashoffset rather than a library: one animation does
        not justify a dependency. Held still for prefers-reduced-motion. */}
    <svg
      viewBox="0 0 52 52"
      className="mx-auto h-16 w-16"
      role="img"
      aria-label="Pago aprobado"
    >
      <circle
        cx="26"
        cy="26"
        r="24"
        fill="none"
        strokeWidth="2"
        className="stroke-primary/30"
      />
      <path
        d="M14 27l8 8 16-16"
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary [stroke-dasharray:48] [stroke-dashoffset:48] motion-safe:animate-[checkmark_600ms_ease-out_forwards] motion-reduce:[stroke-dashoffset:0]"
      />
    </svg>

    <h2 className="mt-5 font-display text-2xl font-bold text-text">
      ¡Listo! Tu plan está activo.
    </h2>

    <dl className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-text-muted">Plan</dt>
        <dd className="font-semibold text-text">{result.planName}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-text-muted">Duración</dt>
        <dd className="text-text">
          {result.months === 1 ? '1 mes' : `${result.months} meses`}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-text-muted">Total abonado</dt>
        <dd className="text-text">
          ${formatPriceDisplay(result.amount ?? 0)} ARS
        </dd>
      </div>
      {result.newEndDate && (
        <div className="flex justify-between gap-4 border-t border-border pt-2">
          <dt className="text-text-muted">Válido hasta</dt>
          <dd className="font-semibold text-primary">
            {formatDateOnly(result.newEndDate)}
          </dd>
        </div>
      )}
    </dl>

    <p className="mt-6 font-body text-sm text-text-muted">
      Te enviamos el comprobante a tu email.
    </p>

    {showAddCardNudge && (
      <p className="mt-2 font-body text-sm text-text-muted">
        Para renovar automáticamente el mes que viene, agregá una tarjeta desde{' '}
        <a href="/dashboard" className="font-medium text-primary hover:underline">
          Mi plan
        </a>
        .
      </p>
    )}

    <div className="mt-6 flex flex-wrap justify-center gap-3">
      <Button href="/dashboard">Ir a mi panel</Button>
      <Button href="/" variant="secondary">
        Volver al inicio
      </Button>
    </div>
  </Card>
);

export default PaymentSuccess;
