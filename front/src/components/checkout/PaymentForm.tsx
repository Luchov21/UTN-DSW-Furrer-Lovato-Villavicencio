import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import FormAlert from '../common/FormAlert';
import { getApiErrorMessage } from '../../services/api-error';
import { classifySubmission, type BrickCardFormData } from './payment-brick';

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
const isConfigured = Boolean(publicKey);

if (isConfigured) {
  initMercadoPago(publicKey);
}

interface PaymentFormProps {
  /**
   * A real, chargeable ARS amount. The Brick prices against this before it
   * will tokenize, and a nominal value under Mercado Pago's ARS minimum makes
   * it refuse every card — see CardForm's comment for the history.
   */
  amount: number;
  /**
   * Enables the Mercado Pago account option. Absent when the preference call
   * failed, in which case the Brick renders cards only rather than the page
   * breaking.
   */
  preferenceId?: string;
  onCardToken: (payment: {
    token: string;
    paymentMethodId: string;
    paymentTypeId: string;
  }) => void;
  /**
   * Arms the charge order. The Brick awaits this promise before redirecting
   * to Mercado Pago, so rejecting cancels the redirect — which is the whole
   * safety property of the wallet path.
   */
  onWalletSubmit: () => Promise<void>;
  onError: (message: string) => void;
  isBusy?: boolean;
}

// Only `token`, `payment_method_id` and the payment type are read from the
// Brick. The PAN, the CVV and every other field stay in the browser and never
// reach our backend. The two we do read are the card's brand and type
// ("visa"/"credit_card") — not PCI-sensitive, and required by the Orders API
// to charge the token.
const PaymentForm = ({
  amount,
  preferenceId,
  onCardToken,
  onWalletSubmit,
  onError,
  isBusy,
}: PaymentFormProps) => {
  if (!isConfigured) {
    return (
      <FormAlert
        type="error"
        message="La integración con Mercado Pago no está configurada. Definí VITE_MP_PUBLIC_KEY en el archivo .env de la aplicación."
      />
    );
  }

  // The installed SDK types the Payment Brick's onSubmit as a single
  // argument (`IPaymentFormData`, carrying `selectedPaymentMethod` and
  // `formData` together) plus an optional second `additionalData` argument —
  // unlike CardPayment's two-argument `(formData, additionalData)` shape.
  // `formData`'s SDK type requires `token`/`payment_method_id` as non-
  // optional strings; `BrickCardFormData` only needs them to be structurally
  // compatible (optional is satisfied by required), so no cast is needed.
  const handleSubmit = async (
    {
      selectedPaymentMethod,
      formData,
    }: { selectedPaymentMethod: string; formData: BrickCardFormData },
    additionalData?: { paymentTypeId?: string } | null,
  ): Promise<void> => {
    const submission = classifySubmission(
      selectedPaymentMethod,
      formData,
      additionalData ?? undefined,
    );

    if (submission.kind === 'unsupported') {
      onError(submission.message);
      // Rejecting rather than returning: a resolved promise tells the Brick
      // the submission succeeded, and for a wallet method that means redirect.
      return Promise.reject(new Error(submission.message));
    }

    if (submission.kind === 'wallet') {
      // Not caught here: a rejection is what stops the redirect. The caller
      // surfaces the message.
      return onWalletSubmit();
    }

    onCardToken({
      token: submission.token,
      paymentMethodId: submission.paymentMethodId,
      paymentTypeId: submission.paymentTypeId,
    });
  };

  return (
    <div aria-busy={isBusy}>
      <Payment
        initialization={{ amount, preferenceId }}
        customization={{
          paymentMethods: {
            creditCard: 'all',
            debitCard: 'all',
            prepaidCard: 'all',
            // Cash (`ticket`) is excluded by omission, which is Mercado
            // Pago's documented way to drop a method type. The preference
            // excludes it again for the hosted page.
            ...(preferenceId ? { mercadoPago: ['wallet_purchase'] } : {}),
            maxInstallments: 1,
          },
        }}
        onSubmit={handleSubmit}
        onError={(err) =>
          onError(getApiErrorMessage(err, 'No se pudo procesar el pago.'))
        }
      />
    </div>
  );
};

export default PaymentForm;
