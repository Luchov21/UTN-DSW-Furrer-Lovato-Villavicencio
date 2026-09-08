import { Check, X, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import { classAllowanceLabel, type MembershipPlan } from './plans.data';
import { formatPriceDisplay } from '../../lib/currency';
import { formatDateOnly } from '../../lib/date';
import type { PlanChangeQuote } from '../../types/plan-change';

interface PlanCardProps {
  plan: MembershipPlan;
  onSelect?: (plan: MembershipPlan) => void;
  isLoading?: boolean;
  isCurrentSubscription?: boolean;
  quote?: PlanChangeQuote;
}

// What the member reads under the price when a quote for this plan is
// available. Ineligible quotes surface the backend's own reason instead of a
// generic message — it is the difference between "why can't I" and silence.
const changeLabel = (quote: PlanChangeQuote): string => {
  if (!quote.eligible) return quote.message ?? '';
  if (quote.direction === 'upgrade') {
    return `Mejorá por $${formatPriceDisplay(quote.amount)} — mantenés el vencimiento del ${formatDateOnly(quote.effectiveEndDate!)}`;
  }
  if (quote.direction === 'downgrade') {
    return `Cambiá sin costo a partir del ${formatDateOnly(quote.effectiveEndDate!)}`;
  }
  return 'Cambiá sin costo ahora';
};

const PlanCard = ({
  plan,
  onSelect,
  isLoading = false,
  isCurrentSubscription = false,
  quote,
}: PlanCardProps) => {
  return (
    <Card
      className={`relative flex h-full flex-col justify-between gap-6 p-8 ${
        plan.highlight
          ? 'border border-primary bg-bg-secondary shadow-[0_0_30px_rgba(34,197,94,0.15)]'
          : 'border-border'
      }`}
    >
      {plan.highlight && (
        <span className="absolute left-6 top-4 z-10 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          Más popular
        </span>
      )}

      <div className="space-y-5">
        <div>
          <h3 className="text-3xl font-bold text-text">{plan.name}</h3>
          {plan.description && (
            <p className="mt-2 text-sm text-text-muted">{plan.description}</p>
          )}
        </div>

        <div className="flex items-end gap-3">
          <span className="text-5xl font-bold text-text">{plan.price}</span>
          <span className="pb-1 text-base text-text-muted">{plan.period}</span>
        </div>

        {quote && (
          <p
            className={`text-sm ${quote.eligible ? 'text-primary' : 'text-text-muted'}`}
          >
            {changeLabel(quote)}
          </p>
        )}

        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          {classAllowanceLabel(plan.maxClasses)}
        </p>

        <ul className="space-y-3">
          {plan.features.map((feature) => (
            <li
              key={feature.label}
              className={`flex items-center gap-3 text-sm ${
                feature.available ? 'text-text' : 'text-text-muted'
              }`}
            >
              {feature.available ? (
                <Check className="h-4 w-4 text-primary shrink-0" />
              ) : (
                <X className="h-4 w-4 text-text-muted shrink-0" />
              )}
              <span>{feature.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <Button
        onClick={() => onSelect?.(plan)}
        disabled={
          isLoading ||
          isCurrentSubscription ||
          (quote ? !quote.eligible : false)
        }
        variant={plan.highlight ? 'primary' : 'secondary'}
        className="w-full"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Procesando...
          </span>
        ) : isCurrentSubscription ? (
          'Plan actual'
        ) : (
          'Elegir plan'
        )}
      </Button>
    </Card>
  );
};

export default PlanCard;
