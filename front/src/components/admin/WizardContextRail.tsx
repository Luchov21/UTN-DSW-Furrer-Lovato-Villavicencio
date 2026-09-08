import MemberCredentialsCard from './MemberCredentialsCard';
import { formatPriceDisplay } from '../../lib/currency';
import type { ChargeSummary } from './plan-charge';
import type { User } from '../../types/user';

interface WizardContextRailProps {
  user: User | null;
  summary: ChargeSummary | null;
  generatedPassword?: string;
}

// The one place the credentials card lives: it used to be rendered inline
// above the step content AND again inside WizardSummaryStep, so anyone
// closing the modal right after step 1 saw it, but scrolling into 'resumen'
// duplicated it. Pinning a single instance here, in a rail that persists
// across every step, is what actually fixes that — not just moving the bug.
const WizardContextRail = ({
  user,
  summary,
  generatedPassword,
}: WizardContextRailProps) => {
  if (!user) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="font-semibold text-text">
          {user.name} {user.surname}
        </p>
        <p className="text-xs text-text-muted">DNI {user.dni ?? 'Sin DNI'}</p>
      </div>

      {generatedPassword && (
        <MemberCredentialsCard
          userId={user.id}
          username={user.email}
          password={generatedPassword}
          planName={summary?.plan.name}
          termLabel={summary?.termLabel}
        />
      )}

      {summary && (
        <dl className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-text-muted">Plan</dt>
            <dd className="font-semibold text-text">{summary.plan.name}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Período</dt>
            <dd className="font-semibold text-text">{summary.termLabel}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-text-muted">Monto</dt>
            <dd className="font-semibold text-text">
              ${formatPriceDisplay(summary.amount)}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
};

export default WizardContextRail;
