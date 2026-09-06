import Button from '../common/Button';
import InputField from '../common/InputField';
import FormAlert from '../common/FormAlert';
import ChargeMethodTiles from './ChargeMethodTiles';
import PendingOrderView from './PendingOrderView';
import { useMemberCharge } from './useMemberCharge';
import {
  isOrderMethod,
  type ChargeMethod,
  type ChargeMonths,
  type ChargeSummary,
} from './plan-charge';
import { formatPriceDisplay, parsePriceInput } from '../../lib/currency';
import type { User } from '../../types/user';

// The same frontend-only mirrors of the backend's single-terminal/single-caja
// setup that useMemberCharge reads to build the charge-order payload (see
// front/.env.example). Read here as well so an unconfigured deploy greys the
// tile out up front, instead of only failing once the admin starts the cobro.
const POINT_TERMINAL_ID = import.meta.env.VITE_MP_POINT_TERMINAL_ID as
  | string
  | undefined;
const QR_EXTERNAL_POS_ID = import.meta.env.VITE_MP_QR_EXTERNAL_POS_ID as
  | string
  | undefined;

const unconfigured = (label: string): string =>
  `${label} no está configurado (falta la variable de entorno del panel).`;

const UNAVAILABLE_METHODS: Partial<Record<ChargeMethod, string>> = {
  ...(POINT_TERMINAL_ID ? {} : { point: unconfigured('Tarjeta (Point)') }),
  ...(QR_EXTERNAL_POS_ID ? {} : { qr: unconfigured('QR') }),
};

interface MemberChargeFormProps {
  selectedUser: User;
  onCharged?: (summary: ChargeSummary) => void;
  onChangeMember?: () => void;
}

// Everything downstream of "a member is picked". It is mounted only while
// there is one, so changing members tears the whole flow down — the same reset
// the old per-member charge form got for free from being conditionally
// mounted, and the reason useMemberCharge lives here rather than in
// ChargePanel: a hook that outlived the member would carry their plan, amount
// and success banner over to the next one.
const MemberChargeForm = ({
  selectedUser,
  onCharged,
  onChangeMember,
}: MemberChargeFormProps) => {
  const {
    plans, plansError, planId, setPlanId, months, setMonths,
    options, resolvedPrice, amountText, setAmountText, autoRenewedToday,
    method, setMethod, orderView, isCreatingOrder, orderError,
    isSaving, formError, success, printWarning, submit, cancelOrder, resetOrder,
  } = useMemberCharge(selectedUser, onCharged);

  // While a point/qr order is pendiente the terminal (or the caja) is holding a
  // single shared physical resource, so nothing that would silently abandon it
  // stays clickable — the admin has to go through "Cancelar cobro", the one
  // path that actually calls cancelChargeOrder.
  const isOrderPending = orderView?.status === 'pendiente';
  const amount = parsePriceInput(amountText);
  const isBusy = isSaving || isCreatingOrder;

  const submitLabel = isCreatingOrder
    ? 'Iniciando cobro...'
    : isSaving
      ? 'Registrando...'
      : isOrderMethod(method)
        ? 'Iniciar cobro'
        : 'Registrar cobro';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-4">
        <div>
          <p className="font-semibold text-text">
            {selectedUser.name} {selectedUser.surname}
          </p>
          <p className="text-xs text-text-muted">
            DNI {selectedUser.dni ?? 'Sin DNI'} · {selectedUser.email}
          </p>
        </div>
        {!isOrderPending && onChangeMember && (
          <button
            type="button"
            onClick={onChangeMember}
            className="text-xs text-text-muted hover:text-primary"
          >
            Cambiar
          </button>
        )}
      </div>

      <FormAlert type="error" message={plansError} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block font-body text-xs sm:text-sm font-medium text-text">
            Plan
          </label>
          <select
            value={planId}
            disabled={isOrderPending}
            onChange={(e) =>
              setPlanId(e.target.value ? Number(e.target.value) : '')
            }
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            <option value="">Elegí un plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block font-body text-xs sm:text-sm font-medium text-text">
            Duración
          </label>
          <select
            value={months}
            onChange={(e) => setMonths(Number(e.target.value) as ChargeMonths)}
            disabled={options.length === 0 || isOrderPending}
            className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {options.map((o) => (
              <option key={o.months} value={o.months}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The double-charge guard: this card is the only in-person charge
          screen, so it is the only place left to warn that the member's
          membership already collected through Mercado Pago today. */}
      {autoRenewedToday && (
        <FormAlert
          type="warning"
          message="Esta membresía ya se renovó automáticamente hoy."
        />
      )}

      <FormAlert
        type="warning"
        message={
          resolvedPrice == null
            ? 'Este plan no tiene un precio para esa duración.'
            : null
        }
      />

      <div>
        <InputField
          label="Monto"
          type="text"
          inputMode="decimal"
          placeholder="Ej: 19995 o 19.995,50"
          value={amountText}
          disabled={isOrderPending}
          onChange={(e) => setAmountText(e.target.value)}
        />
        {amountText && Number.isFinite(amount) && amount > 0 && (
          <p className="mt-1 text-xs text-primary">
            Se va a registrar como ${formatPriceDisplay(amount)}
          </p>
        )}
      </div>

      <ChargeMethodTiles
        value={method}
        onChange={setMethod}
        disabled={isOrderPending}
        unavailable={UNAVAILABLE_METHODS}
      />

      <FormAlert type="error" message={orderError} />
      <FormAlert type="error" message={formError} />
      <FormAlert type="success" message={success} />
      <FormAlert type="warning" message={printWarning} />

      {orderView ? (
        <PendingOrderView
          order={orderView}
          onCancel={() => void cancelOrder()}
          onReset={resetOrder}
        />
      ) : (
        <Button
          onClick={() => void submit(selectedUser.id)}
          disabled={isBusy || resolvedPrice == null}
          className="w-full"
        >
          {submitLabel}
        </Button>
      )}
    </div>
  );
};

export default MemberChargeForm;
