// Turnos are weekly: a class runs on a weekday at an hour, every week. These
// helpers are the one place that knows how a weekday and a time of day read on
// screen, shared by the admin Turnos grid and the public classes page.

// 1 = Monday … 6 = Saturday, matching Date#getDay(). Sunday is missing on
// purpose: the gym is closed (see CLASS_DAYS_LABEL in master-classes.data).
export const WEEKDAYS: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
];

export const weekdayLabel = (weekday: number): string =>
  WEEKDAYS.find((d) => d.value === weekday)?.label ?? `Día ${weekday}`;

export const weekdayShort = (weekday: number): string =>
  WEEKDAYS.find((d) => d.value === weekday)?.short ?? `${weekday}`;

// The backend stores a MySQL 'time' and returns 'HH:MM:SS'; screens and
// <input type="time"> both want 'HH:MM'.
export const formatTimeOfDay = (startTime: string): string =>
  (startTime ?? '').slice(0, 5);

// Minutes since midnight, for comparing a MySQL 'HH:MM:SS' against a clock
// time without building a Date. NaN when the value is not a time, so a caller
// can reject it rather than silently ordering it first.
export const minutesOfDay = (time: string): number => {
  const [hours, minutes] = (time ?? '').split(':');
  const parsedHours = Number(hours);
  const parsedMinutes = Number(minutes);
  if (!Number.isFinite(parsedHours) || !Number.isFinite(parsedMinutes)) {
    return NaN;
  }
  return parsedHours * 60 + parsedMinutes;
};

// "Lun, Mié y Vie" — the days a member with this class+hour attends.
export const formatWeekdayList = (weekdays: number[]): string => {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b).map(weekdayShort);
  if (sorted.length === 0) return '';
  if (sorted.length === 1) return sorted[0];
  return `${sorted.slice(0, -1).join(', ')} y ${sorted[sorted.length - 1]}`;
};
