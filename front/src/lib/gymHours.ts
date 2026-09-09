import { minutesOfDay } from './weekday';

export interface GymDayHours {
  // 'HH:MM', local time.
  open: string;
  close: string;
}

export interface GymStatus {
  isOpen: boolean;
  // Today's closing time while open, null otherwise.
  closesAt: string | null;
  // The next opening time while closed, null while open.
  opensAt: string | null;
  // Date#getDay() index of that next opening, null while open.
  nextOpenDay: number | null;
  // The Spanish sentence both consuming sections render.
  label: string;
}

// Keyed by Date#getDay(): 0 = Sunday. Sunday is null because the gym is shut,
// the same convention lib/weekday.ts uses by starting WEEKDAYS at Monday.
// These are the gym's real hours; they are not admin-editable anywhere, so
// this constant is the single source of truth and the JSON-LD in index.html
// must be kept in step with it.
export const GYM_HOURS: Record<number, GymDayHours | null> = {
  0: null,
  1: { open: '06:00', close: '23:00' },
  2: { open: '06:00', close: '23:00' },
  3: { open: '06:00', close: '23:00' },
  4: { open: '06:00', close: '23:00' },
  5: { open: '06:00', close: '23:00' },
  6: { open: '08:00', close: '20:00' },
};

const DAY_NAMES: Record<number, string> = {
  0: 'domingo',
  1: 'lunes',
  2: 'martes',
  3: 'miércoles',
  4: 'jueves',
  5: 'viernes',
  6: 'sábado',
};

export const getGymStatus = (now: Date): GymStatus => {
  const today = GYM_HOURS[now.getDay()] ?? null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (
    today &&
    nowMinutes >= minutesOfDay(today.open) &&
    nowMinutes < minutesOfDay(today.close)
  ) {
    return {
      isOpen: true,
      closesAt: today.close,
      opensAt: null,
      nextOpenDay: null,
      label: `Abierto ahora · cierra a las ${today.close}`,
    };
  }

  // Still shut this morning: today's own opening is the next one.
  if (today && nowMinutes < minutesOfDay(today.open)) {
    return {
      isOpen: false,
      closesAt: null,
      opensAt: today.open,
      nextOpenDay: now.getDay(),
      label: `Cerrado · abre hoy a las ${today.open}`,
    };
  }

  // Past closing, or a day the gym never opens: walk forward to the next day
  // that has hours. Bounded at 7 so a hypothetical all-null table cannot spin.
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (now.getDay() + offset) % 7;
    const hours = GYM_HOURS[day];
    if (!hours) continue;

    const when =
      offset === 1 ? 'mañana' : `el ${DAY_NAMES[day] ?? `día ${day}`}`;
    return {
      isOpen: false,
      closesAt: null,
      opensAt: hours.open,
      nextOpenDay: day,
      label: `Cerrado · abre ${when} a las ${hours.open}`,
    };
  }

  return {
    isOpen: false,
    closesAt: null,
    opensAt: null,
    nextOpenDay: null,
    label: 'Cerrado',
  };
};
