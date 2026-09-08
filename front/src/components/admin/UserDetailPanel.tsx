import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import Button from '../common/Button';
import InputField from '../common/InputField';
import FormAlert from '../common/FormAlert';
import Modal from './Modal';
import ConfirmDialog from './ConfirmDialog';
import MembershipActionsDialog from './MembershipActionsDialog';
import RegisterPaymentForm from './RegisterPaymentForm';
import AssignPlanForm from './AssignPlanForm';
import UserClassSection from './UserClassSection';
import { formatDateOnly } from '../../lib/date';
import { formatPaymentDate } from '../../lib/payment-date';
import { formatPriceDisplay } from '../../lib/currency';
import { isPlaceholderEmail } from '../../lib/placeholderEmail';
import {
  adminUpdateUser,
  deleteUser,
  restoreUser,
  type AdminUpdateUserPayload,
} from '../../services/user.service';
import {
  getSubscriptionsByUser,
  cancelSubscription,
  pauseSubscription,
  unpauseSubscription,
} from '../../services/subscription.service';
import { getPaymentsByUser } from '../../services/payment.service';
import type { User } from '../../types/user';
import type { Subscription } from '../../types/subscription';
import type { Payment } from '../../types/payment';

interface UserHistory {
  id: number;
  subscriptions: Subscription[];
  payments: Payment[];
}

interface UserDetailPanelProps {
  user: User;
  currentAdminId: number;
  onClose: () => void;
  onChanged: () => void;
}

const UserDetailPanel = ({
  user,
  currentAdminId,
  onClose,
  onChanged,
}: UserDetailPanelProps) => {
  const hasPlaceholderEmail = isPlaceholderEmail(user.email);
  const [form, setForm] = useState<AdminUpdateUserPayload>({
    name: user.name,
    surname: user.surname,
    email: hasPlaceholderEmail ? '' : user.email,
    phone: user.phone,
    role: user.role,
  });
  // DNI is a string here, same reasoning as new-member-wizard.ts: an empty
  // number input reads back as NaN, which can't be told apart from a typo.
  // Correcting it is an admin-only action — a member's own profile form has
  // no such field, since the value is write-once for them.
  const [dniInput, setDniInput] = useState(
    user.dni != null ? String(user.dni) : '',
  );
  const [dniError, setDniError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // The history is tagged with the member it belongs to, so the spinner is
  // derived from the props instead of an effect resetting a flag on every
  // change of user.
  const [history, setHistory] = useState<UserHistory | null>(null);
  const isLoadingHistory = history?.id !== user.id;
  const subscriptions = history?.subscriptions ?? [];
  const payments = history?.payments ?? [];

  const [confirmDangerAction, setConfirmDangerAction] = useState<
    'delete' | 'restore' | 'cancelSub' | 'pause' | 'unpause' | null
  >(null);
  const [pendingSubId, setPendingSubId] = useState<number | null>(null);
  const [isActing, setIsActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // The subscription id currently being offered the refund dialog. Separate
  // from pendingSubId/confirmDangerAction: refund uses a bespoke dialog, not
  // ConfirmDialog, since it needs a real breakdown ConfirmDialog's plain
  // description string has no slot for.
  const [refundSubId, setRefundSubId] = useState<number | null>(null);

  // Every setState lives in an async callback, so the effect below only starts
  // the requests instead of updating state while React renders.
  const fetchHistory = (id: number) =>
    Promise.all([getSubscriptionsByUser(id), getPaymentsByUser(id)])
      .then(([subs, pays]) => {
        setHistory({ id, subscriptions: subs, payments: pays });
      })
      .catch((err: unknown) => {
        setHistory({ id, subscriptions: [], payments: [] });
        setActionError(
          err instanceof Error ? err.message : 'No se pudo cargar el historial.',
        );
      });

  useEffect(() => {
    void fetchHistory(user.id);
  }, [user.id]);

  const reloadHistory = () => {
    setHistory(null);
    return fetchHistory(user.id);
  };

  const isDirty =
    form.name !== user.name ||
    form.surname !== user.surname ||
    form.email !== (hasPlaceholderEmail ? '' : user.email) ||
    form.phone !== user.phone ||
    form.role !== user.role ||
    dniInput !== (user.dni != null ? String(user.dni) : '');

  const handleSave = async () => {
    setSaveError(null);
    setSaveSuccess(null);
    setDniError(null);

    const trimmedDni = dniInput.trim();
    // Empty is legitimate: a Google member has no DNI until they complete their
    // profile, and blocking the whole form on it would leave the one account type
    // an admin most often has to correct completely uneditable. The backend only
    // touches the dni `if (dto.dni != null)`, so omitting it is a no-op there.
    if (trimmedDni && (!/^\d+$/.test(trimmedDni) || Number(trimmedDni) <= 0)) {
      setDniError('El DNI tiene que ser un número entero.');
      return;
    }
    if (trimmedDni && (trimmedDni.length < 7 || trimmedDni.length > 8)) {
      setDniError('El DNI tiene que tener 7 u 8 dígitos.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: AdminUpdateUserPayload = { ...form };
      if (trimmedDni) payload.dni = Number(trimmedDni);
      if (!payload.email?.trim()) delete payload.email;
      await adminUpdateUser(user.id, payload);
      setSaveSuccess('Cambios guardados.');
      onChanged();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDangerConfirm = async () => {
    setIsActing(true);
    setActionError(null);
    try {
      if (confirmDangerAction === 'delete') {
        await deleteUser(user.id);
        onChanged();
        onClose();
      } else if (confirmDangerAction === 'restore') {
        await restoreUser(user.id);
        onChanged();
        onClose();
      } else if (confirmDangerAction === 'cancelSub' && pendingSubId) {
        const sub = subscriptions.find((s) => s.id === pendingSubId);
        if (sub) {
          await cancelSubscription(sub);
          await reloadHistory();
        }
      } else if (confirmDangerAction === 'pause' && pendingSubId) {
        await pauseSubscription(pendingSubId);
        await reloadHistory();
      } else if (confirmDangerAction === 'unpause' && pendingSubId) {
        await unpauseSubscription(pendingSubId);
        await reloadHistory();
      }
      setConfirmDangerAction(null);
      setPendingSubId(null);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo completar la acción.',
      );
    } finally {
      setIsActing(false);
    }
  };

  return (
    <Modal title={`${user.name} ${user.surname}`} onClose={onClose}>
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        {/* Profile */}
        <section>
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-text-muted">
            Datos
          </h4>
          <div className="mt-3 space-y-3">
            <FormAlert type="error" message={saveError} />
            <FormAlert type="success" message={saveSuccess} />
            <InputField
              label="DNI"
              type="text"
              inputMode="numeric"
              value={dniInput}
              onChange={(e) => {
                setDniInput(e.target.value);
                if (dniError) setDniError(null);
              }}
              error={dniError}
              placeholder={user.dni == null ? 'Sin DNI — cuenta creada con Google' : '40123456'}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <InputField
                label="Nombre"
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <InputField
                label="Apellido"
                value={form.surname ?? ''}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
              />
            </div>
            <InputField
              label="Email"
              type="email"
              placeholder={
                hasPlaceholderEmail ? 'Sin email — creado en el gimnasio' : ''
              }
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
            <InputField
              label="Teléfono"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div>
              <label className="mb-1.5 block font-body text-xs sm:text-sm font-medium text-text">
                Rol
              </label>
              <select
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as 'user' | 'admin' })
                }
                disabled={user.id === currentAdminId}
                className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
              >
                <option value="user">Usuario</option>
                <option value="admin">Admin</option>
              </select>
              {user.id === currentAdminId && (
                <p className="mt-1 text-xs text-text-muted">
                  No podés cambiar tu propio rol.
                </p>
              )}
            </div>
            <Button
              onClick={handleSave}
              disabled={!isDirty || isSaving}
              size="sm"
            >
              {isSaving ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </div>
        </section>

        {/* Subscription */}
        <section className="border-t border-border pt-4">
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-text-muted">
            Suscripciones
          </h4>
          {isLoadingHistory ? (
            <p className="mt-3 text-sm text-text-muted">Cargando...</p>
          ) : subscriptions.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">Sin suscripciones.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {subscriptions.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface px-3 py-2 text-sm"
                >
                  <div>
                    <span className="font-semibold text-text">
                      {s.plan?.name ?? `Plan #${s.planId}`}
                    </span>{' '}
                    <span className="text-text-muted">
                      — {s.state} · vence {formatDateOnly(s.endDate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {s.state?.toLowerCase() === 'activa' && !s.deleted && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingSubId(s.id ?? null);
                            setConfirmDangerAction('pause');
                          }}
                          className="text-xs font-semibold text-text-muted hover:text-primary"
                        >
                          Pausar
                        </button>
                        <button
                          type="button"
                          onClick={() => setRefundSubId(s.id ?? null)}
                          className="text-xs font-semibold text-text-muted hover:text-primary"
                        >
                          Reembolsar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPendingSubId(s.id ?? null);
                            setConfirmDangerAction('cancelSub');
                          }}
                          className="text-xs font-semibold text-red-400 hover:text-red-300"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                    {s.state?.toLowerCase() === 'pausada' && !s.deleted && (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingSubId(s.id ?? null);
                          setConfirmDangerAction('unpause');
                        }}
                        className="text-xs font-semibold text-text-muted hover:text-primary"
                      >
                        Reanudar
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-text-muted">
              Asignar plan
            </p>
            <AssignPlanForm userId={user.id} onAssigned={reloadHistory} />
          </div>
        </section>

        <UserClassSection userId={user.id} />

        {/* Payments */}
        <section className="border-t border-border pt-4">
          <h4 className="font-display text-sm font-semibold uppercase tracking-wide text-text-muted">
            Pagos
          </h4>
          {isLoadingHistory ? (
            <p className="mt-3 text-sm text-text-muted">Cargando...</p>
          ) : payments.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              Sin pagos registrados.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex justify-between text-text-muted">
                  <span>{formatPaymentDate(p.date)}</span>
                  <span>${formatPriceDisplay(p.amount)}</span>
                  <span className="capitalize">{p.payMethod}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-text-muted">
              Registrar pago presencial
            </p>
            <RegisterPaymentForm
              // RegisterPaymentForm only loads its subscriptions once, on
              // mount, keyed off its own selectedUser state (it also drives a
              // standalone search flow with no presetUser, so it can't just
              // depend on this prop). Assigning a plan just above refreshes
              // this panel's own subscription list via reloadHistory but
              // never reaches that internal state, so without a key tied to
              // it, a member who had no subscription when the panel opened
              // stays stuck on "no tiene suscripciones" after one is
              // assigned, until the panel is closed and reopened. Remounting
              // on the actual set of subscription ids fixes that while still
              // leaving the key stable for unrelated re-renders (e.g. typing
              // in the Datos form).
              key={subscriptions.map((s) => s.id).join(',')}
              presetUser={user}
              onRegistered={reloadHistory}
            />
          </div>
        </section>

        {/* Danger zone */}
        <section className="rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-2 text-red-400">
            <ShieldAlert className="h-4 w-4" />
            <h4 className="font-display text-sm font-semibold uppercase tracking-wide">
              Zona de peligro
            </h4>
          </div>
          <FormAlert type="error" message={actionError} />
          <div className="mt-3">
            {user.deleted ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmDangerAction('restore')}
              >
                Restaurar cuenta
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => setConfirmDangerAction('delete')}
                className="bg-red-500! hover:bg-red-600! text-white!"
              >
                Dar de baja cuenta
              </Button>
            )}
          </div>
        </section>
      </div>

      {confirmDangerAction && (
        <ConfirmDialog
          title={
            confirmDangerAction === 'delete'
              ? 'Dar de baja cuenta'
              : confirmDangerAction === 'restore'
                ? 'Restaurar cuenta'
                : confirmDangerAction === 'cancelSub'
                  ? 'Cancelar suscripción'
                  : confirmDangerAction === 'pause'
                    ? 'Pausar suscripción'
                    : 'Reanudar suscripción'
          }
          description={
            confirmDangerAction === 'delete'
              ? `"${user.name} ${user.surname}" no va a poder iniciar sesión hasta que se restaure la cuenta.`
              : confirmDangerAction === 'restore'
                ? `"${user.name} ${user.surname}" vuelve a poder iniciar sesión.`
                : confirmDangerAction === 'cancelSub'
                  ? 'Esta suscripción va a quedar cancelada.'
                  : confirmDangerAction === 'pause'
                    ? 'La membresía queda congelada y el socio no puede usarla hasta que se reanude.'
                    : 'La vigencia se extiende por los días que estuvo pausada.'
          }
          confirmLabel={
            confirmDangerAction === 'delete'
              ? 'Dar de baja'
              : confirmDangerAction === 'restore'
                ? 'Restaurar'
                : confirmDangerAction === 'cancelSub'
                  ? 'Cancelar suscripción'
                  : confirmDangerAction === 'pause'
                    ? 'Pausar'
                    : 'Reanudar'
          }
          danger={confirmDangerAction !== 'restore' && confirmDangerAction !== 'unpause'}
          isLoading={isActing}
          onConfirm={handleDangerConfirm}
          onCancel={() => {
            setConfirmDangerAction(null);
            setPendingSubId(null);
          }}
        />
      )}

      {refundSubId !== null && (
        <MembershipActionsDialog
          subscriptionId={refundSubId}
          onClose={() => setRefundSubId(null)}
          onChanged={reloadHistory}
        />
      )}
    </Modal>
  );
};

export default UserDetailPanel;
