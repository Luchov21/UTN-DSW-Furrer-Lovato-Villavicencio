import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import { APP_FEATURES } from './landing.data';

// Every claim here maps to something the member portal actually does today.
// QR door access and digital routines were removed because neither exists —
// see the spec's Decision 8 before adding anything to APP_FEATURES.
const AppPromoSection = () => (
  <section aria-labelledby="app-promo-heading" className="bg-background py-20">
    <Container>
      <div id="app-promo-heading">
        <SectionTitle
          badge="Tu cuenta de socio"
          title="Gestioná tu membresía desde el celular"
          subtitle="Reservás, pagás y seguís tu historial sin pasar por recepción."
        />
      </div>

      <ul className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {APP_FEATURES.map(({ icon: Icon, title, description }) => (
          <li
            key={title}
            className="rounded-3xl border border-border bg-surface p-6"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </span>
            <h3 className="mt-5 font-display text-lg font-semibold text-text">
              {title}
            </h3>
            <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
              {description}
            </p>
          </li>
        ))}
      </ul>
    </Container>
  </section>
);

export default AppPromoSection;
