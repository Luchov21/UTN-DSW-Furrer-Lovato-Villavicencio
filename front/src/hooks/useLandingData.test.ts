// @vitest-environment jsdom
//
// renderHook needs a DOM. The pragma is per-file because vite.config.ts sets no
// global test environment — see PlanCard.test.tsx.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/class.service', () => ({ getClass: vi.fn() }));
vi.mock('../services/typeClass.service', () => ({ getTypeClass: vi.fn() }));
vi.mock('../services/classSession.service', () => ({
  getClassSession: vi.fn(),
}));
vi.mock('../services/trainer.service', () => ({ getTrainers: vi.fn() }));
vi.mock('../services/plan.service', () => ({ getPlans: vi.fn() }));

import { getClass } from '../services/class.service';
import { getClassSession } from '../services/classSession.service';
import { getPlans } from '../services/plan.service';
import { getTrainers } from '../services/trainer.service';
import { getTypeClass } from '../services/typeClass.service';
import { useLandingData } from './useLandingData';
import type { Class } from '../types/class';

const funcional: Class = {
  id: 1,
  name: 'Funcional',
  typeClassId: 10,
  typeClass: { id: 10, name: 'Fuerza' },
  trainerDni: 30111222,
  trainer: {
    dni: 30111222,
    name: 'Martín',
    surname: 'Sosa',
    email: 'm@flg.test',
  },
};

beforeEach(() => {
  vi.mocked(getClass).mockResolvedValue([funcional]);
  vi.mocked(getTypeClass).mockResolvedValue([{ id: 10, name: 'Fuerza' }]);
  vi.mocked(getClassSession).mockResolvedValue([
    { id: 7, classId: 1, weekday: 1, startTime: '19:00:00', maxCapacity: 20 },
  ]);
  vi.mocked(getTrainers).mockResolvedValue([
    { dni: 30111222, name: 'Martín', surname: 'Sosa', email: 'm@flg.test' },
  ]);
  vi.mocked(getPlans).mockResolvedValue([
    { id: 1, name: 'Full', price: 19995, numDays: 30 },
  ]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useLandingData', () => {
  it('loads every resource and joins sessions against classes', async () => {
    const { result } = renderHook(() => useLandingData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.classes).toHaveLength(1);
    expect(result.current.typeClasses).toHaveLength(1);
    expect(result.current.trainers).toHaveLength(1);
    expect(result.current.plans).toHaveLength(1);
    expect(result.current.sessions[0]).toMatchObject({
      id: 7,
      className: 'Funcional',
      trainerName: 'Martín Sosa',
    });
    expect(result.current.errors).toEqual({
      classes: null,
      typeClasses: null,
      sessions: null,
      trainers: null,
      plans: null,
    });
  });

  it('records only the failing resource and leaves the rest intact', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getPlans).mockRejectedValue(
      new Error('Error al obtener lista de planes'),
    );

    const { result } = renderHook(() => useLandingData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.errors.plans).toBe(
      'Error al obtener lista de planes',
    );
    expect(result.current.errors.classes).toBeNull();
    expect(result.current.plans).toEqual([]);
    expect(result.current.classes).toHaveLength(1);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the sessions list empty when classes fail, since the join has nothing to match', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.mocked(getClass).mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useLandingData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.sessions).toEqual([]);
    expect(result.current.errors.classes).toBe('boom');
    expect(result.current.errors.sessions).toBeNull();
  });
});
