interface TermsAcceptanceProps {
  acceptedTerms: boolean;
  acceptedRules: boolean;
  saveCard: boolean;
  onChange: (field: 'terms' | 'rules' | 'saveCard', value: boolean) => void;
  disabled?: boolean;
}

const checkboxClass =
  'mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary disabled:opacity-50';

const TermsAcceptance = ({
  acceptedTerms,
  acceptedRules,
  saveCard,
  onChange,
  disabled,
}: TermsAcceptanceProps) => (
  <div className="space-y-4">
    <label className="flex items-start gap-3 text-xs leading-snug text-text-muted">
      <input
        type="checkbox"
        checked={acceptedTerms}
        disabled={disabled}
        onChange={(e) => onChange('terms', e.target.checked)}
        className={checkboxClass}
      />
      <span>
        Acepto los{' '}
        <a
          href="/terms"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Términos y Condiciones
        </a>{' '}
        y la{' '}
        <a
          href="/privacy"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Política de Privacidad
        </a>
        .
      </span>
    </label>

    <label className="flex items-start gap-3 text-xs leading-snug text-text-muted">
      <input
        type="checkbox"
        checked={acceptedRules}
        disabled={disabled}
        onChange={(e) => onChange('rules', e.target.checked)}
        className={checkboxClass}
      />
      <span>
        Acepto el{' '}
        <a
          href="/rules"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-primary hover:underline"
        >
          Reglamento de Uso
        </a>{' '}
        del gimnasio.
      </span>
    </label>

    <div className="rounded-xl border border-border bg-background p-3.5">
      <label className="flex items-start gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={saveCard}
          disabled={disabled}
          onChange={(e) => onChange('saveCard', e.target.checked)}
          className={checkboxClass}
        />
        <span className="font-semibold">
          Guardar mi tarjeta para el pago automático de los próximos meses
          <span className="ml-1 font-normal text-text-muted">
            (solo si pagás con tarjeta)
          </span>
        </span>
      </label>
      {/* The consequence belongs next to the checkbox, not in a tooltip and
          not buried in the terms page. */}
      <p className="mt-2 pl-7 font-body text-xs leading-snug text-text-muted">
        Al marcar esta casilla autorizás débitos mensuales recurrentes por el
        valor de tu plan. Podés pausarlos o cancelarlos cuando quieras desde tu
        panel.
      </p>
    </div>
  </div>
);

export default TermsAcceptance;
