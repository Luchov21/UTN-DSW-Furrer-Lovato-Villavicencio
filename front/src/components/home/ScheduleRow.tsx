import { formatTimeOfDay } from '../../lib/weekday';
import { spotsTone, type SpotsTone } from './landing-schedule';
import type { LandingSession } from '../../types/landing';

interface ScheduleRowProps {
  session: LandingSession;
  isNext: boolean;
}

// Record rather than a lookup with a default, so an unhandled tone is a
// compile error (CODESTYLE §5).
const toneClasses: Record<SpotsTone, string> = {
  ok: 'border-primary/40 bg-primary/10 text-primary',
  low: 'border-star/40 bg-star/10 text-star',
  full: 'border-red-500/40 bg-red-500/10 text-red-400',
  unknown: '',
};

const spotsLabel = (session: LandingSession, tone: SpotsTone): string => {
  if (tone === 'full') return 'Completo';
  if (session.availableSpots === 1) return '1 lugar';
  return `${session.availableSpots} lugares`;
};

const ScheduleRow = ({ session, isNext }: ScheduleRowProps) => {
  const tone = spotsTone(session.availableSpots);

  const meta = [session.trainerName, session.typeClassName]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  return (
    <li
      className={`flex items-center gap-4 rounded-xl border bg-surface px-4 py-3 ${
        isNext ? 'border-primary/60' : 'border-border'
      }`}
    >
      <span className="w-16 shrink-0 font-display text-base font-bold text-primary">
        {formatTimeOfDay(session.startTime)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate font-body text-sm font-semibold text-text">
          {session.className}
          {isNext && (
            <span className="ml-2 font-body text-xs font-normal text-primary">
              · próxima
            </span>
          )}
        </span>
        {meta && (
          <span className="block truncate font-body text-xs text-text-muted">
            {meta}
          </span>
        )}
      </span>

      {tone !== 'unknown' && (
        <span
          className={`shrink-0 rounded-full border px-3 py-1 font-body text-xs ${toneClasses[tone]}`}
        >
          {spotsLabel(session, tone)}
        </span>
      )}
    </li>
  );
};

export default ScheduleRow;
