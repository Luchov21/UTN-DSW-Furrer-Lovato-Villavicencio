import { useEffect, useState } from 'react';
import Button from '../common/Button';
import InputField from '../common/InputField';
import FormAlert from '../common/FormAlert';
import MemberSearchField from './MemberSearchField';
import { getSubscriptionsByUser } from '../../services/subscription.service';
import { createManualPayment } from '../../services/payment.service';
import { parsePriceInput, formatPriceDisplay } from '../../lib/currency';
import { PAY_METHODS } from './plan-charge';
import type { User } from '../../types/user';
import type { Subscription } from '../../types/subscription';
import type { Payment } from '../../types/payment';

interface RegisterPaymentFormProps {
  presetUser?: User;
  onRegistered?: (payment: Payment) => void;
}

const RegisterPaymentForm = ({
  presetUser,
  onRegistered,
}: RegisterPaymentFormProps) => {
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<User | null>(
    presetUser ?? null,
  );
  // The subscriptions are tagged with the member they belong to, so both the
  // spinner and the reset on member change are derived from the selection
  // instead of an effect writing state during render.
  const [loadedSubs, setLoadedSubs] = useState<{
    userId: number;
    items: Subscription[];
  } | null>(null);
  const subscriptions =
    loadedSubs && loadedSubs.userId === selectedUser?.id
      ? loadedSubs.items
      : [];
  const isLoadingSubs = !!selectedUser && loadedSubs?.userId !== selectedUser.id;
  const [selectedSubId, setSelectedSubId] = useState<number | ''>('');

  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState('1');
  const [payMethod, setPayMethod] = useState<string>(PAY_METHODS[0].value);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [printWarning, setPrintWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedUser) return;
    const userId = selectedUser.id;
    let isCurrent = true;

    void getSubscriptionsByUser(userId)
      .then((subs) => {
        // A response for a member the admin has already moved off used to write
        // state anyway: the spinner never cleared, and the amount field was
        // overwritten with the previous member's price.
        if (!isCurrent) return;
        setLoadedSubs({ userId, items: subs });
        const active = subs.find(
          (s) => s.state?.toLowerCase() === 'activa' && !s.deleted,
        );
        setSelectedSubId(active?.id ?? subs[0]?.id ?? '');
        const price = active?.plan?.price;
        setAmount(price != null ? formatPriceDisplay(price) : '');
      })
      .catch((err: unknown) => {
        if (!isCurrent) return;
        setLoadedSubs({ userId, items: [] });
        setSearchError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar las suscripciones.',
        );
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedUser]);

  const handleSelectSub = (subId: number) => {
    setSelectedSubId(subId);
    const sub = subscriptions.find((s) => s.id === subId);
    const price = sub?.plan?.price;
    setAmount(price != null ? formatPriceDisplay(price) : '');
  };

  const handleSubmit = async () => {
    setFormError(null);
    setSuccess(null);
    setPrintWarning(null);

    if (!selectedSubId) {
      setFormError('Elegí una suscripción.');
      return;
    }
    const amountNum = parsePriceInput(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError('Ingresá un monto válido.');
      return;
    }
    const termMonthsNum = termMonths.trim() === '' ? 1 : Number(termMonths);
    if (!Number.isInteger(termMonthsNum) || termMonthsNum <= 0) {
      setFormError('Ingresá una cantidad de meses válida.');
      return;
    }

    setIsSaving(true);
    try {
      const payment = await createManualPayment({
        subscriptionId: Number(selectedSubId),
        amount: amountNum,
        payMethod: payMethod as
          | 'efectivo'
          | 'debito'
          | 'credito'
          | 'transferencia',
        // Omit for the common single-month case; the backend already
        // defaults to 1 when the field is absent.
        ...(termMonthsNum !== 1 ? { termMonths: termMonthsNum } : {}),
      });
      setSuccess(
        `Pago de $${formatPriceDisplay(amountNum)} registrado correctamente.`,
      );
      if (payment.printStatus === 'error') {
        setPrintWarning(
          'El pago se registró, pero no se pudo imprimir el comprobante en la terminal.',
        );
      }
      setAmount('');
      setTermMonths('1');
      onRegistered?.(payment);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo registrar el pago.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!presetUser && !selectedUser && (
        <MemberSearchField onSelect={setSelectedUser} />
      )}

      {selectedUser && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-text">
                {selectedUser.name} {selectedUser.surname}
              </p>
              <p className="text-xs text-text-muted">
                DNI {selectedUser.dni ?? 'Sin DNI'} · {selectedUser.email}
              </p>
            </div>
            {!presetUser && (
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="text-xs text-text-muted hover:text-primary"
              >
                Cambiar
              </button>
            )}
          </div>

          <FormAlert type="error" message={searchError} />

          {isLoadingSubs ? (
            <p className="mt-3 text-sm text-text-muted">
              Cargando suscripciones...
            </p>
          ) : subscriptions.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              Este socio no tiene suscripciones.
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block font-body text-xs sm:text-sm font-medium text-text">
                  Suscripción
                </label>
                <select
                  value={selectedSubId}
                  onChange={(e) => handleSelectSub(Number(e.target.value))}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {subscriptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.plan?.name ?? `Plan #${s.planId}`} — {s.state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <InputField
                    label="Monto"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ej: 19995 o 19.995,50"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                  {amount &&
                    Number.isFinite(parsePriceInput(amount)) &&
                    parsePriceInput(amount) > 0 && (
                      <p className="mt-1 text-xs text-primary">
                        Se va a registrar como $
                        {formatPriceDisplay(parsePriceInput(amount))}
                      </p>
                    )}
                </div>
                <div>
                  <label className="mb-1.5 block font-body text-xs sm:text-sm font-medium text-text">
                    Método
                  </label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <InputField
                    label="Meses que cubre este pago"
                    type="text"
                    inputMode="numeric"
                    placeholder="1"
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                  />
                </div>
              </div>

              <FormAlert type="error" message={formError} />
              <FormAlert type="success" message={success} />
              <FormAlert type="warning" message={printWarning} />

              <Button
                onClick={handleSubmit}
                disabled={isSaving}
                className="w-full"
              >
                {isSaving ? 'Registrando...' : 'Registrar pago'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RegisterPaymentForm;
