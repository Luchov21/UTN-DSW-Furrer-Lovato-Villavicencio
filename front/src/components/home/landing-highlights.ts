import type { Class } from '../../types/class';
import type { ClassSession } from '../../types/classSession';
import type { LandingErrors } from '../../types/landing';
import type { Trainer } from '../../types/trainer';

// The Class entity has no popularity flag, so "most popular" is read off the
// timetable: the more weekly slots the admin gave a class, the more the gym
// runs it. Ties break by name so two equally scheduled classes do not swap
// places between renders.
export const topClassesBySessionCount = (
  classes: Class[],
  sessions: ClassSession[],
  limit = 3,
): Class[] => {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    counts.set(session.classId, (counts.get(session.classId) ?? 0) + 1);
  }

  return [...classes]
    .sort((a, b) => {
      const difference =
        (counts.get(b.id ?? -1) ?? 0) - (counts.get(a.id ?? -1) ?? 0);
      return difference !== 0 ? difference : a.name.localeCompare(b.name);
    })
    .slice(0, limit);
};

export interface HeroCounts {
  disciplines: number | null;
  trainers: number | null;
}

// null means "we could not read this", which the hero renders by omitting the
// figure. Zero means the read worked and the gym really has none. Collapsing
// the two would print "0 disciplinas" during a backend outage.
export const heroCounts = (
  classes: Class[],
  trainers: Trainer[],
  errors: LandingErrors,
): HeroCounts => ({
  disciplines: errors.classes ? null : classes.length,
  trainers: errors.trainers ? null : trainers.length,
});
