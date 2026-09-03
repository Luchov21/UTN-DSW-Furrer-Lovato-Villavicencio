import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import FormAlert from '../common/FormAlert';
import { getApiErrorMessage } from '../../services/api-error';

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
const isConfigured = Boolean(publicKey);

// Runs once at module load; initMercadoPago just re-sets the key if called
// again, so per-mount initialization would be wasted work.
if (isConfigured) {
  initMercadoPago(publicKey);
}

interface CardFormProps {
  /**
   * A real, chargeable ARS amount. The Brick prices installments against this
   * before it will tokenize, and a nominal 1 falls under Mercado Pago's ARS
   * minimum — which is what made it refuse every card with "Could not obtain
   * payment information".
   */
  amount: number;
  onToken: (token: string) => void;
  onError: (message: string) => void;
  isBusy?: boolean;
}

const CardForm = ({ amount, onToken, onError, isBusy }: CardFormProps) => {
  if (!isConfigured) {
    return (
      <FormAlert
        type="error"
        message="La integración con Mercado Pago no está configurada. Definí VITE_MP_PUBLIC_KEY en el archivo .env de la aplicación."
      />
    );
  }

  // Only `token` is read: the PAN, the CVV and every other field the Brick's
  // callback returns stay in the browser and never reach our backend.
  const handleSubmit = async (formData: { token: string }): Promise<void> => {
    onToken(formData.token);
  };

  return (
    <div aria-busy={isBusy}>
      <CardPayment
        initialization={{ amount }}
        onSubmit={handleSubmit}
        onError={(err) =>
          onError(getApiErrorMessage(err, 'No se pudo procesar la tarjeta.'))
        }
      />
    </div>
  );
};

export default CardForm;
