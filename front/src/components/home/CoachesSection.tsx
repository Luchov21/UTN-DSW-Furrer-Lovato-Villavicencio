import Button from '../common/Button';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import TrainerCard from '../trainers/TrainerCard';
import LandingSectionShell from './LandingSectionShell';
import { LANDING_ANCHORS } from './landing.data';
import type { Trainer } from '../../types/trainer';

interface CoachesSectionProps {
  trainers: Trainer[];
  isLoading: boolean;
  error: string | null;
}

const PREVIEW_COUNT = 3;

const CoachesSection = ({
  trainers,
  isLoading,
  error,
}: CoachesSectionProps) => {
  // The order GET /trainer returns, trimmed to a preview. The full team lives
  // at /trainers; duplicating the whole roster here would be a second copy of
  // that page.
  const preview = trainers.slice(0, PREVIEW_COUNT);

  return (
    <section
      id={LANDING_ANCHORS.coaches}
      aria-labelledby="coaches-heading"
      className="bg-background py-20"
    >
      <Container>
        <div id="coaches-heading">
          <SectionTitle
            badge="Equipo"
            title="Quién te va a acompañar"
            subtitle="Profesores reales del gimnasio, con sus certificaciones y las clases que dictan."
          />
        </div>

        <LandingSectionShell
          isLoading={isLoading}
          error={error}
          isEmpty={trainers.length === 0}
          emptyTitle="Todavía no hay profesores publicados"
          emptyMessage="Estamos actualizando el equipo. Escribinos y te contamos quién está dando clases esta semana."
          skeleton={
            <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((slot) => (
                <div
                  key={slot}
                  className="h-96 animate-pulse rounded-3xl border border-border bg-surface"
                />
              ))}
            </div>
          }
        >
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {preview.map((trainer) => (
              <TrainerCard key={trainer.dni} trainer={trainer} />
            ))}
          </div>

          {trainers.length > PREVIEW_COUNT && (
            <div className="mt-12 flex justify-center">
              <Button href="/trainers" variant="secondary">
                Ver todo el equipo
              </Button>
            </div>
          )}
        </LandingSectionShell>
      </Container>
    </section>
  );
};

export default CoachesSection;
