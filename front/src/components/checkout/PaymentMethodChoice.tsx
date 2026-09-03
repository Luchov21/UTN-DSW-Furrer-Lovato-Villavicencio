import { CreditCard } from 'lucide-react';
import FormAlert from '../common/FormAlert';
import { formatCardLabel, cardExpiryWarning } from '../dashboard/saved-card';
import type { SavedCard } from '../../types/savedCard';

interface PaymentMethodChoiceProps {
  card: SavedCard | null;
  useSavedCard: boolean;
  onChange: (useSavedCard: boolean) => void;
  disabled?: boolean;
}

const optionClass = (isSelected: boolean) =>
  `flex w-full items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${
    isSelected
      ? 'border-primary bg-primary/10'
      : 'border-border bg-background hover:border-primary/40'
  }`;

const PaymentMethodChoice = ({
  card,
  useSavedCard,
  onChange,
  disabled,
}: PaymentMethodChoiceProps) => {
  if (!card) {
    return null;
  }

  const expiryWarning = cardExpiryWarning(card, new Date());

  return (
    <div className="space-y-3">
      {expiryWarning && <FormAlert type="warning" message={expiryWarning} />}

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(true)}
        aria-pressed={useSavedCard}
        className={optionClass(useSavedCard)}
      >
        <CreditCard className="h-5 w-5 shrink-0 text-primary" />
        <span className="font-body text-sm text-text">
          Usar mi tarjeta guardada — {formatCardLabel(card)}
        </span>
      </button>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(false)}
        aria-pressed={!useSavedCard}
        className={optionClass(!useSavedCard)}
      >
        <CreditCard className="h-5 w-5 shrink-0 text-text-muted" />
        <span className="font-body text-sm text-text">Usar otra tarjeta</span>
      </button>
    </div>
  );
};

export default PaymentMethodChoice;
