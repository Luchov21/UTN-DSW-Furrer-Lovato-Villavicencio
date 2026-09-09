import { CalendarClock, User } from 'lucide-react';
import Badge from '../common/badge/Badge';
import Card from '../common/Card';
import type { Class } from '../../types/class';

interface DisciplineCardProps {
  item: Class;
  onShowSchedule: (classId: number) => void;
}

const DisciplineCard = ({ item, onShowSchedule }: DisciplineCardProps) => {
  const trainer = item.trainer;

  return (
    <Card className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl font-semibold text-text">
          {item.name}
        </h3>
        {item.typeClass?.name && (
          <Badge variant="neutral" className="!px-3 !py-1">
            {item.typeClass.name}
          </Badge>
        )}
      </div>

      {item.description && (
        <p className="font-body text-sm leading-relaxed text-text-muted">
          {item.description}
        </p>
      )}

      {trainer && (
        <p className="flex items-center gap-2 font-body text-sm text-text-muted">
          <User className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          Prof. {trainer.name} {trainer.surname}
        </p>
      )}

      <button
        type="button"
        onClick={() => item.id !== undefined && onShowSchedule(item.id)}
        className="mt-auto inline-flex items-center justify-center gap-2 rounded-full border border-border-button px-4 py-2.5 font-body text-sm font-semibold text-text transition-colors duration-300 hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <CalendarClock className="h-4 w-4" aria-hidden="true" />
        Ver horarios de esta clase
      </button>
    </Card>
  );
};

export default DisciplineCard;
