import { minutesOfDay } from '../../lib/weekday';
import type { Class } from '../../types/class';
import type { ClassSession } from '../../types/classSession';
import type { LandingSession } from '../../types/landing';

// GET /classSession loads relations: { class: true } and no deeper, so the
// trainer and the type have to come from the GET /class rows. A session whose
// class is absent — soft-deleted between the two requests — is dropped rather
// than rendered without a name.
export const enrichSessions = (
  sessions: ClassSession[],
  classes: Class[],
): LandingSession[] => {
  const byId = new Map(classes.map((item) => [item.id, item]));

  return sessions.flatMap((session) => {
    if (session.id === undefined) return [];

    const parent = byId.get(session.classId);
    if (!parent) return [];

    const trainer = parent.trainer;

    return [
      {
        id: session.id,
        classId: session.classId,
        weekday: session.weekday,
        startTime: session.startTime,
        maxCapacity: session.maxCapacity,
        availableSpots: session.availableSpots ?? null,
        className: parent.name,
        typeClassName: parent.typeClass?.name ?? null,
        trainerName: trainer ? `${trainer.name} ${trainer.surname}` : null,
      },
    ];
  });
};

export const sessionsForWeekday = (
  sessions: LandingSession[],
  weekday: number,
): LandingSession[] =>
  sessions
    .filter((session) => session.weekday === weekday)
    .sort((a, b) => minutesOfDay(a.startTime) - minutesOfDay(b.startTime));

// The next slot on the weekly grid, searching today from `now` and then each
// following day, wrapping through the whole week. Sessions are weekly, so a
// week with any session at all always has a next one.
export const nextSessionFrom = (
  sessions: LandingSession[],
  now: Date,
): LandingSession | null => {
  if (sessions.length === 0) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = ((now.getDay() + offset - 1 + 7) % 7) + 1;
    const candidates = sessionsForWeekday(sessions, weekday);
    const found =
      offset === 0
        ? candidates.find(
            (session) => minutesOfDay(session.startTime) >= nowMinutes,
          )
        : candidates[0];

    if (found) return found;
  }

  return null;
};
