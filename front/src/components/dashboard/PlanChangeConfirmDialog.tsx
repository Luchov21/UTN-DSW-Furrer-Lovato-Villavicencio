import Card from '../common/Card';
import Button from '../common/Button';
import { formatDateOnly } from '../../lib/date';
import { formatPriceDisplay } from '../../lib/currency';
import type { MembershipPlan } from '../plans/plans.data';
import type { Subscription } from '../../types/subscription';
import type { PlanChangeQuote } from '../../types/plan-change';

interface PlanChangeConfirmDialogProps {
  pendingPlan: MembershipPlan;
  subscription: Subscription | null;
  quote: PlanChangeQuote | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}

// The four-way copy a plan pick can show: a first-time purchase (no
// subscription yet, so no quote to read from) keeps the original checkout
// wording; a member who already has a subscription sees the real cost/date
// for their specific direction — upgrade, downgrade, or lateral — never the
// same paragraph for all three.
const PlanChangeConfirmDialog = ({
  pendingPlan,
  subscription,
  quote,
  onConfirm,
  onCancel,
}: PlanChangeConfirmDialogProps) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <Card className="w-full max-w-md hover:translate-y-0 hover:shadow-lg">
        <h4 className="font-display text-lg font-semibold text-text">
          Confirmar cambio de plan
        </h4>
        <p className="mt-3 text-sm text-text-muted">
          {!subscription ? (
            <>
              Vas a elegir{' '}
              <span className="font-semibold text-text">
                "{pendingPlan.name}"
              </span>{' '}
              ({pendingPlan.price}
              {pendingPlan.period}). Te llevamos al checkout para completar el
              pago.
            </>
          ) : quote?.direction === 'upgrade' ? (
            <>
              Vas a pasar a{' '}
              <span className="font-semibold text-text">
                "{pendingPlan.name}"
              </span>{' '}
              por{' '}
              <span className="font-semibold text-text">
                ${formatPriceDisplay(quote.amount)}
              </span>
              , y mantenés tu vencimiento del{' '}
              {formatDateOnly(quote.effectiveEndDate!)}. Te llevamos al checkout
              para completar el pago.
            </>
          ) : quote?.direction === 'downgrade' ? (
            <>
              Seguís con "{subscription?.plan?.name}" hasta el{' '}
              {formatDateOnly(quote.effectiveEndDate!)}. A partir del día
              siguiente pasás a{' '}
              <span className="font-semibold text-text">
                "{pendingPlan.name}"
              </span>
              . No se cobra nada ahora.
            </>
          ) : (
            <>
              Pasás a{' '}
              <span className="font-semibold text-text">
                "{pendingPlan.name}"
              </span>{' '}
              ahora mismo, sin costo, manteniendo tu vencimiento.
            </>
          )}
        </p>

        <div className="mt-6 flex gap-3">
          <Button onClick={onConfirm} className="flex-1">
            Confirmar
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PlanChangeConfirmDialog;
