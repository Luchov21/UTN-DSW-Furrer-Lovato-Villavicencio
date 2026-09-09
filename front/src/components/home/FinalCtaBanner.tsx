import Container from '../common/Container';
import { buildWhatsAppHref } from '../../lib/whatsapp';
import { LANDING_ANCHORS } from './landing.data';

// Not a reuse of common/CTASection: that component routes both buttons through
// Button href, which renders a react-router Link and cannot emit the external
// wa.me URL this banner needs.
const WHATSAPP_HREF = buildWhatsAppHref(
  '¡Hola! Quiero saber más sobre los planes de FLG.',
);

const FinalCtaBanner = () => (
  <section aria-labelledby="final-cta-heading" className="bg-primary py-20">
    <Container className="text-center">
      <h2
        id="final-cta-heading"
        className="font-display text-3xl font-bold text-background sm:text-5xl"
      >
        ¿Empezamos?
      </h2>
      <p className="mx-auto mt-4 max-w-xl font-body leading-relaxed text-background/80">
        Vení a probar las instalaciones sin cargo, o contratá tu plan online en
        dos minutos.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-4">
        <a
          href={`#${LANDING_ANCHORS.freePass}`}
          className="inline-flex items-center justify-center rounded-full bg-background px-6 py-3 font-body font-semibold text-primary shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl"
        >
          Reclamar mi pase gratis
        </a>
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center rounded-full border border-background/40 px-6 py-3 font-body font-semibold text-background transition-all duration-300 hover:bg-background/10"
        >
          Escribinos por WhatsApp
        </a>
      </div>
    </Container>
  </section>
);

export default FinalCtaBanner;
