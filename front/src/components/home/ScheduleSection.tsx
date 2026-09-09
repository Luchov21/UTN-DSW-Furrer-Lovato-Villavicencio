import { useState } from 'react';
import { X } from 'lucide-react';
import Button from '../common/Button';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import { getGymStatus } from '../../lib/gymHours';
import { WEEKDAYS } from '../../lib/weekday';
import LandingSectionShell from './LandingSectionShell';
import ScheduleRow from './ScheduleRow';
import { nextSessionFrom, sessionsForWeekday } from './landing-schedule';
import { LANDING_ANCHORS } from './landing.data';
import type { LandingSession } from '../../types/landing';

interface ScheduleSectionProps {
  sessions: LandingSession[];
  isLoading: boolean;
  error: string | null;
  focusedClassId: number | null;
  onClearFocus: () => void;
}

// WEEKDAYS runs 1..6; the gym is shut on Sunday, so a Sunday visitor is shown
// Monday rather than an empty day.
const todayWeekday = (now: Date): number => {
  const day = now.getDay();
  return day === 0 ? 1 : day;
};

const ScheduleSection = ({
  sessions,
  isLoading,
  error,
  focusedClassId,
  onClearFocus,
}: ScheduleSectionProps) => {
  // Read once per mount: a landing page is not open long enough for the day to
  // roll over, and re-reading on every render would make the output unstable.
  const [now] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(() => todayWeekday(now));

  const status = getGymStatus(now);
  const next = nextSessionFrom(sessions, now);

  const visible = sessionsForWeekday(sessions, selectedDay).filter(
    (session) => focusedClassId === null || session.classId === focusedClassId,
  );

  const focusedName =
    focusedClassId === null
      ? null
      : (sessions.find((session) => session.classId === focusedClassId)
          ?.className ?? null);

  return (
    <section
      id={LANDING_ANCHORS.schedule}
      aria-labelledby="schedule-heading"
      className="bg-bg-secondary py-20"
    >
      <Container>
        <div id="schedule-heading">
          <SectionTitle
            badge="Horarios"
            title="Qué se entrena cada día"
            subtitle="La grilla real de turnos semanales, tal como está cargada en el sistema."
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-body text-sm ${
              status.isOpen
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-surface text-text-muted'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${status.isOpen ? 'bg-primary' : 'bg-text-muted'}`}
            />
            {status.label}
          </span>
          {next && (
            <span className="font-body text-sm text-text-muted">
              Próxima clase: {next.className}
            </span>
          )}
        </div>

        <LandingSectionShell
          isLoading={isLoading}
          error={error}
          isEmpty={sessions.length === 0}
          emptyTitle="Todavía no hay turnos publicados"
          emptyMessage="La grilla de clases se está cargando. Mientras tanto, la sala de musculación funciona con normalidad."
          skeleton={
            <div className="mx-auto mt-10 max-w-3xl space-y-3">
              {[0, 1, 2, 3].map((slot) => (
                <div
                  key={slot}
                  className="h-16 animate-pulse rounded-xl border border-border bg-surface"
                />
              ))}
            </div>
          }
        >
          <div className="mx-auto mt-10 max-w-3xl">
            <div
              role="tablist"
              aria-label="Día de la semana"
              className="flex gap-2 overflow-x-auto pb-2"
            >
              {WEEKDAYS.map((day) => {
                const isSelected = day.value === selectedDay;
                return (
                  <button
                    key={day.value}
                    type="button"
                    role="tab"
                    id={`schedule-tab-${day.value}`}
                    aria-selected={isSelected}
                    aria-controls="schedule-panel"
                    tabIndex={isSelected ? 0 : -1}
                    onClick={() => setSelectedDay(day.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key !== 'ArrowRight' &&
                        event.key !== 'ArrowLeft'
                      )
                        return;
                      event.preventDefault();
                      const step = event.key === 'ArrowRight' ? 1 : -1;
                      const nextIndex =
                        (WEEKDAYS.findIndex(
                          (item) => item.value === selectedDay,
                        ) +
                          step +
                          WEEKDAYS.length) %
                        WEEKDAYS.length;
                      const nextDay = WEEKDAYS[nextIndex].value;
                      setSelectedDay(nextDay);
                      document
                        .getElementById(`schedule-tab-${nextDay}`)
                        ?.focus();
                    }}
                    className={`shrink-0 rounded-xl border px-4 py-2 font-body text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      isSelected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
                    }`}
                  >
                    {day.value === todayWeekday(now)
                      ? `Hoy · ${day.short}`
                      : day.short}
                  </button>
                );
              })}
            </div>

            {focusedClassId !== null && (
              <button
                type="button"
                onClick={onClearFocus}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 font-body text-xs text-primary transition-colors hover:bg-primary/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {focusedName
                  ? `Filtrando por ${focusedName}`
                  : 'Filtrando por una clase'}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sr-only">Quitar el filtro</span>
              </button>
            )}

            <div
              role="tabpanel"
              id="schedule-panel"
              aria-labelledby={`schedule-tab-${selectedDay}`}
              className="mt-5"
            >
              {visible.length === 0 ? (
                <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center font-body text-sm text-text-muted">
                  No hay clases programadas para este día.
                </p>
              ) : (
                <ul className="space-y-3">
                  {visible.map((session) => (
                    <ScheduleRow
                      key={session.id}
                      session={session}
                      isNext={next?.id === session.id}
                    />
                  ))}
                </ul>
              )}
            </div>

            <p className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 font-body text-xs text-text-muted">
              La sala de musculación y peso libre está abierta de corrido de
              06:00 a 23:00 hs y no necesita reserva de turno.
            </p>

            <div className="mt-8 flex justify-center">
              <Button href="/class" variant="secondary">
                Reservar una clase
              </Button>
            </div>
          </div>
        </LandingSectionShell>
      </Container>
    </section>
  );
};

export default ScheduleSection;
