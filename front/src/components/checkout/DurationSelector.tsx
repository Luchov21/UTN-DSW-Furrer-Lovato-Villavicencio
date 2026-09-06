import type { CheckoutSummary } from '../../types/checkout';
import { formatPriceDisplay } from '../../lib/currency';

interface DurationSelectorProps {
  summary: CheckoutSummary;
  /**
   * Which button reads as selected. Defaults to `summary.months` — but a
   * caller that keeps the previous summary on screen while a fresh one
   * loads (see CheckoutWallet) must pass the just-clicked value explicitly,
   * or the selection would appear to snap back to the old duration until
   * the reload finishes.
   */
  selectedMonths?: number;
  onChange: (months: number) => void;
  disabled?: boolean;
}

const monthsLabel = (months: number) =>
  months === 1 ? '1 mes' : `${months} meses`;

// A longer term should read as a saving, not as a bigger number, so each
// option is labelled with its monthly equivalent rather than its total.
const DurationSelector = ({
  summary,
  selectedMonths,
  onChange,
  disabled,
}: DurationSelectorProps) => {
  if (summary.availableMonths.length < 2) {
    return null;
  }

  return (
    <div>
      <p className="font-body text-xs font-semibold uppercase tracking-wide text-text-muted">
        Duración
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {summary.availableMonths.map((months) => {
          const isSelected = months === (selectedMonths ?? summary.months);
          return (
            <button
              key={months}
              type="button"
              disabled={disabled}
              onClick={() => onChange(months)}
              aria-pressed={isSelected}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                isSelected
                  ? 'border-primary bg-primary/10 text-text'
                  : 'border-border bg-background text-text-muted hover:border-primary/40'
              }`}
            >
              <span className="block font-body text-sm font-semibold">
                {monthsLabel(months)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-muted">
        {summary.discount > 0
          ? `Ahorrás $${formatPriceDisplay(summary.discount)} pagando ${monthsLabel(summary.months)} por adelantado.`
          : 'Elegí por cuánto tiempo querés contratar tu plan.'}
      </p>
    </div>
  );
};

export default DurationSelector;
