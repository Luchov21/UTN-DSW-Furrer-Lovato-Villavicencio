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
  onToken: (payment: {
    token: string;
    paymentMethodId: string;
    paymentTypeId: string;
  }) => void;
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

  // Only `token`, `payment_method_id` and `payment_type_id` are read from the
  // Brick's callback. The PAN, the CVV and every other field it returns stay
  // in the browser and never reach our backend. payment_method_id/
  // payment_type_id are not PCI-sensitive — they're the card's brand and
  // type (e.g. "visa"/"credit_card"), which Mercado Pago's Orders API needs
  // explicitly to charge the token.
  const handleSubmit = async (formData: {
    token: string;
    payment_method_id: string;
    payment_type_id: string;
  }): Promise<void> => {
    onToken({
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      paymentTypeId: formData.payment_type_id,
    });
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
