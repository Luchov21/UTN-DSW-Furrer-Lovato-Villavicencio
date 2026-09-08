import { MapPin } from 'lucide-react';
import Button from '../common/Button';
import Container from '../common/Container';
import { heroCounts } from './landing-highlights';
import { GYM_LOCATION, LANDING_ANCHORS } from './landing.data';
import type { Class } from '../../types/class';
import type { LandingErrors } from '../../types/landing';
import type { Trainer } from '../../types/trainer';

interface HeroSectionProps {
  classes: Class[];
  trainers: Trainer[];
  errors: LandingErrors;
}

const HeroSection = ({ classes, trainers, errors }: HeroSectionProps) => {
  const counts = heroCounts(classes, trainers, errors);

  // A count is omitted rather than shown as zero when its request failed, so an
  // outage never advertises "0 disciplinas". See landing-highlights.ts.
  const facts = [
    counts.disciplines !== null ? `${counts.disciplines} disciplinas` : null,
    counts.trainers !== null ? `${counts.trainers} profesores` : null,
    'Lun a vie 06–23 hs',
  ].filter((fact): fact is string => fact !== null);

  return (
    <section
      id={LANDING_ANCHORS.hero}
      aria-labelledby="hero-heading"
      className="border-b border-border bg-background pt-14 pb-10 lg:pt-20"
    >
      <Container>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-1.5 font-body text-xs text-text-muted">
          <MapPin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {GYM_LOCATION.street}, {GYM_LOCATION.city}
        </span>

        <h1
          id="hero-heading"
          className="mt-6 max-w-4xl font-display text-5xl font-extrabold leading-[0.95] tracking-tight text-text sm:text-6xl lg:text-8xl"
        >
          TU MEJOR
          <br />
          <span className="text-primary">VERSIÓN</span> EMPIEZA ACÁ
        </h1>

        <div className="mt-10 grid grid-cols-1 items-end gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-surface">
            <video
              src="/videos/hero-video3.mp4"
              poster="/images/hero-imagen.avif"
              autoPlay
              muted
              loop
              playsInline
              preload="none"
              aria-hidden="true"
              tabIndex={-1}
              className="h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
            />
          </div>

          <div>
            <p className="font-body text-base leading-relaxed text-text-muted">
              Equipamiento de primera línea, clases guiadas todos los días y
              profesores que te acompañan desde el primer ejercicio.
            </p>

            <ul className="mt-5 flex flex-wrap gap-2">
              {facts.map((fact) => (
                <li
                  key={fact}
                  className="rounded-full border border-border bg-surface px-3 py-1 font-body text-xs text-text-muted"
                >
                  {fact}
                </li>
              ))}
            </ul>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href={`#${LANDING_ANCHORS.freePass}`}
                className="inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 font-body font-semibold text-background shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary-hover hover:shadow-xl"
              >
                Quiero mi pase gratis de 1 día
              </a>
              <Button href="/membership" variant="secondary">
                Ver planes y precios
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
};

export default HeroSection;
