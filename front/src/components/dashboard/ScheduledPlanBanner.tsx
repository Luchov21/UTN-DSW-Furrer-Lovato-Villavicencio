import { Loader2 } from 'lucide-react';
import Button from '../common/Button';
import { formatDateOnly, dayAfterDateOnly } from '../../lib/date';

interface ScheduledPlanBannerProps {
  planName: string;
  /** The current subscription's raw `endDate`; the change lands the day after. */
  endDate: string;
  onCancel: () => void;
  isCancelling: boolean;
}

// Shown on the "Plan actual" card when a free downgrade or lateral move is
// queued to take effect the day after the current term ends (see
// PlanSection's confirmChange / resolvePlanChangeAction).
const ScheduledPlanBanner = ({
  planName,
  endDate,
  onCancel,
  isCancelling,
}: ScheduledPlanBannerProps) => {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <p className="text-sm text-amber-400">
        Vas a pasar a {planName} el{' '}
        {formatDateOnly(dayAfterDateOnly(String(endDate).slice(0, 10)))}.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={onCancel}
        disabled={isCancelling}
      >
        {isCancelling ? (
          <span className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cancelando...
          </span>
        ) : (
          'Cancelar cambio'
        )}
      </Button>
    </div>
  );
};

export default ScheduledPlanBanner;
