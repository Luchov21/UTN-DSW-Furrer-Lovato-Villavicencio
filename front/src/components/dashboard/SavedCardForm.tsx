import { useState } from 'react';
import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import { Loader2 } from 'lucide-react';
import FormAlert from '../common/FormAlert';
import { saveCard } from '../../services/savedCard.service';
import { getApiErrorMessage } from '../../services/api-error';
import type { SavedCard } from '../../types/savedCard';

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
const isConfigured = Boolean(publicKey);

// Runs once at module load, same as every other MP Brick usage — calling it
// again per mount would be wasted work, initMercadoPago just re-sets the key.
if (isConfigured) {
  initMercadoPago(publicKey);
}

interface SavedCardFormProps {
  onSaved: (card: SavedCard) => void;
  // A real, chargeable ARS amount — the member's current plan price. The
  // Brick prices installments against this before it will tokenize, and a
  // nominal 1 falls under Mercado Pago's ARS minimum, which is what made it
  // refuse every card with "Could not obtain payment information".
  // Nothing is charged here: onSubmit only reads formData.token.
  amount: number;
}

const SavedCardForm = ({ onSaved, amount }: SavedCardFormProps) => {
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isConfigured) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-sm text-amber-400">
        La integración con Mercado Pago no está configurada. Definí
        VITE_MP_PUBLIC_KEY en el archivo .env de la aplicación.
      </div>
    );
  }

  // Only the `token` field is read; typing the parameter narrowly (rather
  // than importing the Brick's internal ICardPaymentFormData type) keeps this
  // file decoupled from the SDK's deep, unexported type paths.
  const handleSubmit = async (formData: { token: string }): Promise<void> => {
    setIsSaving(true);
    setError(null);
    try {
      // Only the token travels to our backend — never the PAN, CVV, or any
      // other field the Brick's callback returns.
      const card = await saveCard(formData.token);
      onSaved(card);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : getApiErrorMessage(err, 'No se pudo guardar la tarjeta.'),
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <FormAlert type="error" message={error} />
      {isSaving && (
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Guardando tarjeta...
        </div>
      )}
      <CardPayment
        initialization={{ amount }}
        onSubmit={handleSubmit}
        onError={(err) => {
          setError(getApiErrorMessage(err, 'No se pudo guardar la tarjeta.'));
        }}
      />
    </div>
  );
};

export default SavedCardForm;
