import { describe, expect, it } from 'vitest';
import {
  enrichSessions,
  nextSessionFrom,
  sessionsForWeekday,
} from './landing-schedule';
import type { Class } from '../../types/class';
import type { ClassSession } from '../../types/classSession';

const funcional: Class = {
  id: 1,
  name: 'Funcional',
  description: 'Circuito de fuerza y resistencia',
  typeClassId: 10,
  typeClass: { id: 10, name: 'Fuerza' },
  trainerDni: 30111222,
  trainer: {
    dni: 30111222,
    name: 'Martín',
    surname: 'Sosa',
    email: 'martin@flg.test',
  },
};

const spinning: Class = {
  id: 2,
  name: 'Spinning',
  typeClassId: 11,
  typeClass: { id: 11, name: 'Cardio' },
  trainerDni: 30333444,
  trainer: {
    dni: 30333444,
    name: 'Ana',
    surname: 'Ruiz',
    email: 'ana@flg.test',
  },
};

const session = (over: Partial<ClassSession>): ClassSession => ({
  id: 1,
  classId: 1,
  weekday: 1,
  startTime: '19:00:00',
  maxCapacity: 20,
  availableSpots: 5,
  ...over,
});

describe('enrichSessions', () => {
  it('flattens the class name, type and trainer onto the session', () => {
    const [result] = enrichSessions([session({})], [funcional]);

    expect(result).toEqual({
      id: 1,
      classId: 1,
      weekday: 1,
      startTime: '19:00:00',
      maxCapacity: 20,
      availableSpots: 5,
      className: 'Funcional',
      typeClassName: 'Fuerza',
      trainerName: 'Martín Sosa',
    });
  });

  it('drops a session whose class is not in the class list', () => {
    // The class was soft-deleted between the two requests: GET /class no longer
    // returns it, but the session row is still in flight. Rendering it would
    // show a row with no name.
    const result = enrichSessions([session({ classId: 999 })], [funcional]);
    expect(result).toEqual([]);
  });

  it('drops a session with no id, which cannot be keyed in a list', () => {
    const result = enrichSessions([session({ id: undefined })], [funcional]);
    expect(result).toEqual([]);
  });

  it('leaves trainer and type null when the class carries neither', () => {
    const bare: Class = { id: 3, name: 'Libre', typeClassId: 0, trainerDni: 0 };
    const [result] = enrichSessions([session({ classId: 3 })], [bare]);

    expect(result.trainerName).toBeNull();
    expect(result.typeClassName).toBeNull();
  });

  it('reads availableSpots as null when the API omits it', () => {
    const [result] = enrichSessions(
      [session({ availableSpots: undefined })],
      [funcional],
    );
    expect(result.availableSpots).toBeNull();
  });
});

describe('sessionsForWeekday', () => {
  const all = enrichSessions(
    [
      session({ id: 1, classId: 2, weekday: 1, startTime: '20:00:00' }),
      session({ id: 2, classId: 1, weekday: 1, startTime: '08:00:00' }),
      session({ id: 3, classId: 1, weekday: 2, startTime: '09:00:00' }),
    ],
    [funcional, spinning],
  );

  it('keeps only the requested weekday, earliest first', () => {
    const monday = sessionsForWeekday(all, 1);
    expect(monday.map((s) => s.startTime)).toEqual(['08:00:00', '20:00:00']);
  });

  it('returns an empty array for a day with no sessions', () => {
    expect(sessionsForWeekday(all, 6)).toEqual([]);
  });
});

describe('nextSessionFrom', () => {
  // 2026-09-07 is a Monday.
  const mondayAt = (hours: number, minutes: number): Date =>
    new Date(2026, 8, 7, hours, minutes, 0);

  const all = enrichSessions(
    [
      session({ id: 1, classId: 1, weekday: 1, startTime: '08:00:00' }),
      session({ id: 2, classId: 2, weekday: 1, startTime: '19:00:00' }),
      session({ id: 3, classId: 1, weekday: 2, startTime: '09:00:00' }),
    ],
    [funcional, spinning],
  );

  it('returns the next session still to come today', () => {
    expect(nextSessionFrom(all, mondayAt(10, 0))?.id).toBe(2);
  });

  it('returns a session starting exactly now', () => {
    expect(nextSessionFrom(all, mondayAt(19, 0))?.id).toBe(2);
  });

  it('rolls to the next day once today is done', () => {
    expect(nextSessionFrom(all, mondayAt(21, 0))?.id).toBe(3);
  });

  it('wraps around the week when the last day is done', () => {
    // Tuesday 10:00, after that day's only class: the next one is Monday's 08:00.
    const tuesdayAt10 = new Date(2026, 8, 8, 10, 0, 0);
    expect(nextSessionFrom(all, tuesdayAt10)?.id).toBe(1);
  });

  it('returns null when there are no sessions at all', () => {
    expect(nextSessionFrom([], mondayAt(10, 0))).toBeNull();
  });
});
