import { describe, expect, it } from 'vitest';
import { minutesOfDay } from './weekday';
import { getGymStatus, GYM_HOURS } from './gymHours';

describe('minutesOfDay', () => {
  it('reads the HH:MM:SS the backend returns', () => {
    expect(minutesOfDay('19:30:00')).toBe(19 * 60 + 30);
  });

  it('reads a bare HH:MM', () => {
    expect(minutesOfDay('06:00')).toBe(360);
  });

  it('treats midnight as zero', () => {
    expect(minutesOfDay('00:00:00')).toBe(0);
  });

  it('returns NaN for a value that is not a time, so callers can reject it', () => {
    expect(minutesOfDay('')).toBeNaN();
  });
});

// Local time, which is what getGymStatus reads. Month is 0-indexed.
// 2026-09-07 is a Monday, so +n days walks the week from there.
const mondayAt = (hours: number, minutes: number): Date =>
  new Date(2026, 8, 7, hours, minutes, 0);
const dayAt = (offset: number, hours: number, minutes: number): Date =>
  new Date(2026, 8, 7 + offset, hours, minutes, 0);

describe('GYM_HOURS', () => {
  it('is closed on Sunday', () => {
    expect(GYM_HOURS[0]).toBeNull();
  });

  it('runs 06:00-23:00 on weekdays and 08:00-20:00 on Saturday', () => {
    expect(GYM_HOURS[1]).toEqual({ open: '06:00', close: '23:00' });
    expect(GYM_HOURS[5]).toEqual({ open: '06:00', close: '23:00' });
    expect(GYM_HOURS[6]).toEqual({ open: '08:00', close: '20:00' });
  });
});

describe('getGymStatus', () => {
  it('is closed one minute before opening', () => {
    const status = getGymStatus(mondayAt(5, 59));
    expect(status.isOpen).toBe(false);
    expect(status.opensAt).toBe('06:00');
    expect(status.label).toBe('Cerrado · abre hoy a las 06:00');
  });

  it('is open exactly at opening time', () => {
    const status = getGymStatus(mondayAt(6, 0));
    expect(status.isOpen).toBe(true);
    expect(status.closesAt).toBe('23:00');
    expect(status.label).toBe('Abierto ahora · cierra a las 23:00');
  });

  it('is open one minute before closing', () => {
    expect(getGymStatus(mondayAt(22, 59)).isOpen).toBe(true);
  });

  it('is closed exactly at closing time, and points at tomorrow', () => {
    const status = getGymStatus(mondayAt(23, 0));
    expect(status.isOpen).toBe(false);
    expect(status.opensAt).toBe('06:00');
    expect(status.label).toBe('Cerrado · abre mañana a las 06:00');
  });

  it('uses Saturday hours on Saturday', () => {
    // Saturday is 5 days after Monday.
    expect(getGymStatus(dayAt(5, 7, 30)).isOpen).toBe(false);
    expect(getGymStatus(dayAt(5, 8, 0)).isOpen).toBe(true);
    expect(getGymStatus(dayAt(5, 19, 59)).isOpen).toBe(true);
    expect(getGymStatus(dayAt(5, 20, 0)).isOpen).toBe(false);
  });

  it('names the weekday when the next opening is neither today nor tomorrow', () => {
    // Saturday 21:00: closed, and Sunday is shut, so the next opening is Monday.
    const status = getGymStatus(dayAt(5, 21, 0));
    expect(status.isOpen).toBe(false);
    expect(status.nextOpenDay).toBe(1);
    expect(status.label).toBe('Cerrado · abre el lunes a las 06:00');
  });

  it('is closed all Sunday and opens on Monday', () => {
    // Sunday is 6 days after Monday.
    const status = getGymStatus(dayAt(6, 12, 0));
    expect(status.isOpen).toBe(false);
    expect(status.closesAt).toBeNull();
    expect(status.label).toBe('Cerrado · abre mañana a las 06:00');
  });
});
