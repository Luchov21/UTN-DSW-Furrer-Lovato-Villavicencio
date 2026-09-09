import type { Class } from './class';
import type { Plan } from './plan';
import type { Trainer } from './trainer';
import type { TypeClass } from './typeClass';

// The five public reads the landing page makes. One error slot per read, so a
// dead endpoint takes down its own section and nothing else.
export type LandingResource =
  'classes' | 'typeClasses' | 'sessions' | 'trainers' | 'plans';

export type LandingErrors = Record<LandingResource, string | null>;

// A ClassSession flattened against its Class, because GET /classSession loads
// relations: { class: true } and stops there — the trainer and the type live on
// the Class rows from GET /class.
export interface LandingSession {
  id: number;
  classId: number;
  weekday: number;
  // 'HH:MM:SS' as MySQL returns it; render through formatTimeOfDay.
  startTime: string;
  maxCapacity: number;
  availableSpots: number | null;
  className: string;
  typeClassName: string | null;
  // 'Nombre Apellido', or null when the class has no trainer loaded.
  trainerName: string | null;
}

export interface LandingData {
  classes: Class[];
  typeClasses: TypeClass[];
  sessions: LandingSession[];
  trainers: Trainer[];
  plans: Plan[];
  isLoading: boolean;
  errors: LandingErrors;
}
