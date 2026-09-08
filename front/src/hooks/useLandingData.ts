import { useEffect, useState } from 'react';
import { enrichSessions } from '../components/home/landing-schedule';
import { getClass } from '../services/class.service';
import { getClassSession } from '../services/classSession.service';
import { getPlans } from '../services/plan.service';
import { getTrainers } from '../services/trainer.service';
import { getTypeClass } from '../services/typeClass.service';
import type { Class } from '../types/class';
import type { ClassSession } from '../types/classSession';
import type {
  LandingData,
  LandingErrors,
  LandingResource,
} from '../types/landing';
import type { Plan } from '../types/plan';
import type { Trainer } from '../types/trainer';
import type { TypeClass } from '../types/typeClass';

const NO_ERRORS: LandingErrors = {
  classes: null,
  typeClasses: null,
  sessions: null,
  trainers: null,
  plans: null,
};

// allSettled never rejects, so a try/catch around it can never fire. Each
// rejection is unwrapped here instead: logged with the operation that failed,
// then handed to the one section that renders it. Nothing is substituted for
// missing data — a hardcoded fallback would hide the outage (CODESTYLE §4).
const unwrap = <T>(
  outcome: PromiseSettledResult<T>,
  resource: LandingResource,
  fallback: T,
  errors: LandingErrors,
): T => {
  if (outcome.status === 'fulfilled') return outcome.value;

  const reason: unknown = outcome.reason;
  errors[resource] =
    reason instanceof Error ? reason.message : `No se pudo cargar ${resource}.`;
  console.warn(`Landing data: ${resource} request failed`, reason);
  return fallback;
};

/**
 * Fetches everything the public landing page renders, in one parallel burst.
 *
 * One error slot per resource: a dead endpoint removes its own section and
 * leaves the rest of the page working. Sessions are returned already joined
 * against the class list, because GET /classSession does not load the trainer.
 */
export const useLandingData = (): LandingData => {
  const [data, setData] = useState<Omit<LandingData, 'isLoading'>>({
    classes: [],
    typeClasses: [],
    sessions: [],
    trainers: [],
    plans: [],
    errors: NO_ERRORS,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const [classesOut, typeClassesOut, sessionsOut, trainersOut, plansOut] =
        await Promise.allSettled([
          getClass(),
          getTypeClass(),
          getClassSession(),
          getTrainers(),
          getPlans(),
        ]);

      if (!isMounted) return;

      const errors: LandingErrors = { ...NO_ERRORS };
      const classes = unwrap<Class[]>(classesOut, 'classes', [], errors);
      const typeClasses = unwrap<TypeClass[]>(
        typeClassesOut,
        'typeClasses',
        [],
        errors,
      );
      const rawSessions = unwrap<ClassSession[]>(
        sessionsOut,
        'sessions',
        [],
        errors,
      );
      const trainers = unwrap<Trainer[]>(trainersOut, 'trainers', [], errors);
      const plans = unwrap<Plan[]>(plansOut, 'plans', [], errors);

      setData({
        classes,
        typeClasses,
        sessions: enrichSessions(rawSessions, classes),
        trainers,
        plans,
        errors,
      });
      setIsLoading(false);
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  return { ...data, isLoading };
};
