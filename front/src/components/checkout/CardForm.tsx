import { CardPayment, initMercadoPago } from '@mercadopago/sdk-react';
import FormAlert from '../common/FormAlert';
import { getApiErrorMessage } from '../../services/api-error';

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
const isConfigured = Boolean(publicKey);

// Runs once at module load; initMercadoPago just re-sets the key if called
// again, so per-mount initialization would be wasted work.
if (isConfigured) {
  initMercadoPago(publicKey, { locale: 'es-AR' });
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

  // Only `token`, `payment_method_id` and `paymentTypeId` are read from the
  // Brick's callbacks. The PAN, the CVV and every other field they return
  // stay in the browser and never reach our backend. payment_method_id/
  // paymentTypeId are not PCI-sensitive — they're the card's brand and type
  // (e.g. "visa"/"credit_card"), which Mercado Pago's Orders API needs
  // explicitly to charge the token.
  //
  // paymentTypeId is NOT on the Brick's first onSubmit argument (the SDK's
  // own ICardPaymentFormData type has no such field) — it only arrives on
  // the second, `additionalData` argument. Reading it off the first
  // argument (as this used to) silently sent `undefined`, which the
  // backend's CheckoutDto correctly rejected as "should not be empty".
  const handleSubmit = async (
    formData: { token: string; payment_method_id: string },
    additionalData?: { paymentTypeId?: string },
  ): Promise<void> => {
    if (!additionalData?.paymentTypeId) {
      onError('No se pudo determinar el tipo de tarjeta. Probá de nuevo.');
      return;
    }

    onToken({
      token: formData.token,
      paymentMethodId: formData.payment_method_id,
      paymentTypeId: additionalData.paymentTypeId,
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
