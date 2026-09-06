import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Payment, initMercadoPago } from '@mercadopago/sdk-react';
import { Loader2 } from 'lucide-react';
import FormAlert from '../common/FormAlert';
import { getApiErrorMessage } from '../../services/api-error';
import { classifySubmission, type BrickCardFormData } from './payment-brick';

const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY;
const isConfigured = Boolean(publicKey);

if (isConfigured) {
  initMercadoPago(publicKey, { locale: 'es-AR' });
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
  /**
   * Set while the checkboxes below the Brick aren't both accepted yet. The
   * Brick stays visible and fillable regardless (see CheckoutWallet) — this
   * is what actually blocks the charge. It has to reject the Brick's own
   * onSubmit, not just have the parent silently ignore onCardToken: a
   * RESOLVED onSubmit reads as "submission accepted" to the Brick, which
   * then clears the card fields, forcing the member to retype everything
   * just to tick two boxes. Rejecting is the documented way to fail an
   * attempt while leaving the form as the member left it.
   */
  submitBlockedMessage?: string;
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
  submitBlockedMessage,
}: PaymentFormProps) => {
  // The SDK's own Payment wrapper re-inits the whole Brick — wiping
  // whatever the member already typed — any time `initialization`,
  // `customization`, `onSubmit`, or `onError` change BY REFERENCE (its
  // internal `useEffect` lists them as deps; see
  // node_modules/@mercadopago/sdk-react/.../bricks/payment/index.js). All
  // four used to be recreated fresh on every render (inline object/arrow
  // literals), so ticking a checkbox in the parent — or any other unrelated
  // re-render — reset the Brick. `latest` lets handleSubmit/handleError stay
  // referentially stable for the component's whole mounted lifetime while
  // still always acting on the current props; initialization/customization
  // are memoized on the values that actually should change them.
  const latest = useRef({ onCardToken, onWalletSubmit, onError, submitBlockedMessage });
  // Updated in an effect, not during render — mutating a ref while rendering
  // is what React's own lint rule (react-hooks/refs) flags, since it can
  // desync from what was actually committed to the screen.
  useEffect(() => {
    latest.current = { onCardToken, onWalletSubmit, onError, submitBlockedMessage };
  });

  // The installed SDK types the Payment Brick's onSubmit as a single
  // argument (`IPaymentFormData`, carrying `selectedPaymentMethod` and
  // `formData` together) plus an optional second `additionalData` argument —
  // unlike CardPayment's two-argument `(formData, additionalData)` shape.
  // `formData`'s SDK type requires `token`/`payment_method_id` as non-
  // optional strings; `BrickCardFormData` only needs them to be structurally
  // compatible (optional is satisfied by required), so no cast is needed.
  const handleSubmit = useCallback(
    async (
      {
        selectedPaymentMethod,
        formData,
      }: { selectedPaymentMethod: string; formData: BrickCardFormData },
      additionalData?: { paymentTypeId?: string } | null,
    ): Promise<void> => {
      const current = latest.current;
      if (current.submitBlockedMessage) {
        current.onError(current.submitBlockedMessage);
        return Promise.reject(new Error(current.submitBlockedMessage));
      }

      const submission = classifySubmission(
        selectedPaymentMethod,
        formData,
        additionalData ?? undefined,
      );

      if (submission.kind === 'unsupported') {
        current.onError(submission.message);
        // Rejecting rather than returning: a resolved promise tells the
        // Brick the submission succeeded, and for a wallet method that
        // means redirect.
        return Promise.reject(new Error(submission.message));
      }

      if (submission.kind === 'wallet') {
        // Not caught here: a rejection is what stops the redirect. The
        // caller surfaces the message.
        return current.onWalletSubmit();
      }

      current.onCardToken({
        token: submission.token,
        paymentMethodId: submission.paymentMethodId,
        paymentTypeId: submission.paymentTypeId,
      });
    },
    [],
  );

  const handleError = useCallback((err: unknown) => {
    latest.current.onError(
      getApiErrorMessage(err, 'No se pudo procesar el pago.'),
    );
  }, []);

  const initialization = useMemo(
    () => ({ amount, preferenceId }),
    [amount, preferenceId],
  );
  const customization = useMemo(
    () => ({
      paymentMethods: {
        creditCard: 'all' as const,
        debitCard: 'all' as const,
        prepaidCard: 'all' as const,
        // Cash (`ticket`) is excluded by omission, which is Mercado Pago's
        // documented way to drop a method type. The preference excludes it
        // again for the hosted page.
        ...(preferenceId ? { mercadoPago: ['wallet_purchase' as const] } : {}),
        maxInstallments: 1,
      },
    }),
    [preferenceId],
  );

  if (!isConfigured) {
    return (
      <FormAlert
        type="error"
        message="La integración con Mercado Pago no está configurada. Definí VITE_MP_PUBLIC_KEY en el archivo .env de la aplicación."
      />
    );
  }

  return (
    <div aria-busy={isBusy} className="relative">
      <Payment
        initialization={initialization}
        customization={customization}
        onSubmit={handleSubmit}
        onError={handleError}
      />
      {/* Masks the Brick's own blank/processing state between onSubmit
          resolving and the parent swapping this whole form out for the
          result — without this, that gap reads as the page breaking. */}
      {isBusy && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-background/90 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-text-muted">Procesando tu pago...</p>
        </div>
      )}
    </div>
  );
};

export default PaymentForm;
