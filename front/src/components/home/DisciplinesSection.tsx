import { useState } from 'react';
import Button from '../common/Button';
import Container from '../common/Container';
import FormAlert from '../common/FormAlert';
import SectionTitle from '../common/SectionTitle';
import DisciplineCard from './DisciplineCard';
import LandingSectionShell from './LandingSectionShell';
import { topClassesBySessionCount } from './landing-highlights';
import { LANDING_ANCHORS } from './landing.data';
import type { Class } from '../../types/class';
import type { LandingErrors, LandingSession } from '../../types/landing';
import type { TypeClass } from '../../types/typeClass';

interface DisciplinesSectionProps {
  classes: Class[];
  typeClasses: TypeClass[];
  sessions: LandingSession[];
  isLoading: boolean;
  errors: LandingErrors;
  onShowSchedule: (classId: number) => void;
}

const ALL = 'all';

const chipClasses = (isActive: boolean): string =>
  `rounded-full border px-4 py-2 font-body text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
    isActive
      ? 'border-primary bg-primary/10 text-primary'
      : 'border-border text-text-muted hover:border-primary/50 hover:text-text'
  }`;

const DisciplinesSection = ({
  classes,
  typeClasses,
  sessions,
  isLoading,
  errors,
  onShowSchedule,
}: DisciplinesSectionProps) => {
  const [activeType, setActiveType] = useState<number | typeof ALL>(ALL);

  const filtered =
    activeType === ALL
      ? classes
      : classes.filter((item) => item.typeClassId === activeType);

  // The Class entity has no popularity flag; the ranking comes from the number
  // of weekly sessions the admin scheduled. See landing-highlights.ts.
  const featured = topClassesBySessionCount(
    filtered,
    sessions.map((session) => ({
      id: session.id,
      classId: session.classId,
      weekday: session.weekday,
      startTime: session.startTime,
      maxCapacity: session.maxCapacity,
    })),
  );

  return (
    <section
      id={LANDING_ANCHORS.disciplines}
      aria-labelledby="disciplines-heading"
      className="bg-background py-20"
    >
      <Container>
        <div id="disciplines-heading">
          <SectionTitle
            badge="Disciplinas"
            title="Elegí cómo querés entrenar"
            subtitle="Todas las clases que ves acá son las que el gimnasio dicta hoy, con su profesor a cargo."
          />
        </div>

        <LandingSectionShell
          isLoading={isLoading}
          error={errors.classes}
          isEmpty={classes.length === 0}
          emptyTitle="Todavía no hay clases publicadas"
          emptyMessage="Estamos cargando el catálogo. Escribinos por WhatsApp y te contamos qué actividades están funcionando."
          skeleton={
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((slot) => (
                <div
                  key={slot}
                  className="h-64 animate-pulse rounded-3xl border border-border bg-surface"
                />
              ))}
            </div>
          }
        >
          {errors.typeClasses ? (
            <div className="mx-auto mt-10 max-w-md">
              <FormAlert type="error" message={errors.typeClasses} />
            </div>
          ) : (
            typeClasses.length > 0 && (
              <div className="mt-10 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveType(ALL)}
                  className={chipClasses(activeType === ALL)}
                >
                  Todas
                </button>
                {typeClasses.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() =>
                      type.id !== undefined && setActiveType(type.id)
                    }
                    className={chipClasses(activeType === type.id)}
                  >
                    {type.name}
                  </button>
                ))}
              </div>
            )
          )}

          {featured.length === 0 ? (
            <p className="mt-10 text-center font-body text-sm text-text-muted">
              No hay clases de esa categoría por ahora.
            </p>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((item) => (
                <DisciplineCard
                  key={item.id ?? item.name}
                  item={item}
                  onShowSchedule={onShowSchedule}
                />
              ))}
            </div>
          )}

          {filtered.length > featured.length && (
            <div className="mt-12 flex justify-center">
              <Button href="/class" variant="secondary">
                Ver todas las clases
              </Button>
            </div>
          )}
        </LandingSectionShell>
      </Container>
    </section>
  );
};

export default DisciplinesSection;
