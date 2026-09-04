import { Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { formatPriceDisplay } from '../../lib/currency';
import type { CheckoutSummary } from '../../types/checkout';

interface OrderSummaryProps {
  summary: CheckoutSummary;
}

// Every claim here is one the architecture actually earns: the Brick
// tokenizes in the browser, so no card data reaches our servers. If that ever
// stops being true, this copy has to change with it.
const TRUST_SIGNALS = [
  {
    Icon: ShieldCheck,
    text: 'Pago procesado de forma segura por Mercado Pago',
  },
  {
    Icon: Lock,
    text: 'Tus datos de tarjeta viajan cifrados y no se guardan en nuestros servidores',
  },
  { Icon: RotateCcw, text: 'Cancelá o pausá cuando quieras desde tu panel' },
];

const OrderSummary = ({ summary }: OrderSummaryProps) => (
  <aside className="rounded-2xl border border-border bg-surface p-6 lg:sticky lg:top-24">
    <h2 className="font-display text-lg font-semibold text-text">Tu compra</h2>

    <div className="mt-4 flex items-baseline justify-between gap-4">
      <span className="font-body text-sm text-text">{summary.planName}</span>
      <span className="font-body text-sm text-text-muted">
        ${formatPriceDisplay(summary.monthlyPrice)} / mes
      </span>
    </div>

    <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
      <div className="flex justify-between gap-4">
        <dt className="text-text-muted">
          Subtotal ({summary.months} × $
          {formatPriceDisplay(summary.monthlyPrice)})
        </dt>
        <dd className="text-text">${formatPriceDisplay(summary.subtotal)}</dd>
      </div>
      {summary.discount > 0 && (
        <div className="flex justify-between gap-4">
          <dt className="text-text-muted">
            Descuento por {summary.months} meses
          </dt>
          <dd className="text-primary">
            −${formatPriceDisplay(summary.discount)}
          </dd>
        </div>
      )}
    </dl>

    <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-border pt-4">
      <span className="font-body text-sm font-semibold text-text">
        Total a pagar hoy
      </span>
      <span className="font-display text-2xl font-bold text-text">
        ${formatPriceDisplay(summary.total)}
        <span className="ml-1 text-xs font-normal text-text-muted">ARS</span>
      </span>
    </div>

    <ul className="mt-6 space-y-2.5 border-t border-border pt-4">
      {TRUST_SIGNALS.map(({ Icon, text }) => (
        <li key={text} className="flex items-start gap-2.5">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span className="font-body text-xs leading-snug text-text-muted">
            {text}
          </span>
        </li>
      ))}
    </ul>
  </aside>
);

export default OrderSummary;
