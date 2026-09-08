import { describe, expect, it } from 'vitest';
import { heroCounts, topClassesBySessionCount } from './landing-highlights';
import type { Class } from '../../types/class';
import type { ClassSession } from '../../types/classSession';
import type { LandingErrors } from '../../types/landing';
import type { Trainer } from '../../types/trainer';

const makeClass = (id: number, name: string): Class => ({
  id,
  name,
  typeClassId: 1,
  trainerDni: 1,
});

const makeSession = (id: number, classId: number): ClassSession => ({
  id,
  classId,
  weekday: 1,
  startTime: '19:00:00',
  maxCapacity: 20,
});

const noErrors: LandingErrors = {
  classes: null,
  typeClasses: null,
  sessions: null,
  trainers: null,
  plans: null,
};

describe('topClassesBySessionCount', () => {
  const classes = [
    makeClass(1, 'Funcional'),
    makeClass(2, 'Spinning'),
    makeClass(3, 'HIIT'),
    makeClass(4, 'Yoga'),
  ];

  it('ranks by how many weekly sessions each class has', () => {
    const sessions = [
      makeSession(1, 2),
      makeSession(2, 2),
      makeSession(3, 2),
      makeSession(4, 3),
      makeSession(5, 3),
      makeSession(6, 1),
    ];

    const result = topClassesBySessionCount(classes, sessions);
    expect(result.map((item) => item.name)).toEqual([
      'Spinning',
      'HIIT',
      'Funcional',
    ]);
  });

  it('breaks ties by name so the order is stable between renders', () => {
    const sessions = [makeSession(1, 3), makeSession(2, 1), makeSession(3, 2)];

    const result = topClassesBySessionCount(classes, sessions);
    expect(result.map((item) => item.name)).toEqual([
      'Funcional',
      'HIIT',
      'Spinning',
    ]);
  });

  it('still returns classes that have no sessions scheduled yet', () => {
    const result = topClassesBySessionCount(classes, []);
    expect(result).toHaveLength(3);
  });

  it('returns everything it has when there are fewer than the limit', () => {
    const result = topClassesBySessionCount([makeClass(1, 'Funcional')], []);
    expect(result).toHaveLength(1);
  });

  it('honours an explicit limit', () => {
    expect(topClassesBySessionCount(classes, [], 2)).toHaveLength(2);
  });

  it('returns an empty array when there are no classes', () => {
    expect(topClassesBySessionCount([], [])).toEqual([]);
  });
});

describe('heroCounts', () => {
  const trainers: Trainer[] = [
    { dni: 1, name: 'Ana', surname: 'Ruiz', email: 'a@flg.test' },
    { dni: 2, name: 'Martín', surname: 'Sosa', email: 'm@flg.test' },
  ];

  it('counts what actually loaded', () => {
    const result = heroCounts(
      [makeClass(1, 'Funcional'), makeClass(2, 'Spinning')],
      trainers,
      noErrors,
    );
    expect(result).toEqual({ disciplines: 2, trainers: 2 });
  });

  it('reports null rather than zero when a read failed', () => {
    // Zero would read as "this gym has no trainers", which is a lie about the
    // gym rather than a report about the request.
    const result = heroCounts([], trainers, {
      ...noErrors,
      classes: 'Error al obtener lista de clases',
    });
    expect(result).toEqual({ disciplines: null, trainers: 2 });
  });

  it('reports zero when the read succeeded and there genuinely is nothing', () => {
    expect(heroCounts([], [], noErrors)).toEqual({
      disciplines: 0,
      trainers: 0,
    });
  });
});
