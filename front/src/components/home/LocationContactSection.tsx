import { useState } from 'react';
import { Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import { GYM_HOURS, getGymStatus } from '../../lib/gymHours';
import {
  buildWhatsAppHref,
  formatWhatsAppPhone,
  WHATSAPP_NUMBER,
} from '../../lib/whatsapp';
import { GYM_LOCATION, LANDING_ANCHORS } from './landing.data';

// Rendered from GYM_HOURS rather than retyped, so the badge, this list and the
// JSON-LD in index.html can never disagree about when the gym is open.
const HOUR_ROWS = [
  { label: 'Lunes a viernes', hours: GYM_HOURS[1] },
  { label: 'Sábados', hours: GYM_HOURS[6] },
  { label: 'Domingos', hours: GYM_HOURS[0] },
];

const WHATSAPP_HREF = buildWhatsAppHref(
  '¡Hola! Quisiera hacer una consulta sobre el gimnasio.',
);

const LocationContactSection = () => {
  // Read once per mount; see ScheduleSection for the same reasoning.
  const [now] = useState(() => new Date());
  const status = getGymStatus(now);

  return (
    <section
      id={LANDING_ANCHORS.location}
      aria-labelledby="location-heading"
      className="bg-background py-20"
    >
      <Container>
        <div id="location-heading">
          <SectionTitle
            badge="Ubicación"
            title="Dónde estamos"
            subtitle="A pasos del centro de Rosario, con horarios amplios de lunes a sábado."
          />
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-surface p-8">
            <span
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-body text-sm ${
                status.isOpen
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border bg-background text-text-muted'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${status.isOpen ? 'bg-primary' : 'bg-text-muted'}`}
              />
              {status.label}
            </span>

            <address className="mt-6 not-italic">
              <p className="flex items-start gap-3 font-body text-sm text-text">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {GYM_LOCATION.street}, {GYM_LOCATION.city},{' '}
                {GYM_LOCATION.province}
              </p>
              <p className="mt-3 flex items-center gap-3 font-body text-sm text-text-muted">
                <Phone
                  className="h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {GYM_LOCATION.phoneDisplay}
              </p>
              <p className="mt-3 flex items-center gap-3 font-body text-sm text-text-muted">
                <Mail
                  className="h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                {GYM_LOCATION.email}
              </p>
            </address>

            <dl className="mt-8 space-y-2 border-t border-border pt-6">
              {HOUR_ROWS.map((row) => (
                <div key={row.label} className="flex justify-between gap-4">
                  <dt className="font-body text-sm text-text-muted">
                    {row.label}
                  </dt>
                  <dd className="font-body text-sm font-medium text-text">
                    {row.hours
                      ? `${row.hours.open} a ${row.hours.close} hs`
                      : 'Cerrado'}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={GYM_LOCATION.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-body text-sm font-semibold text-background transition-colors hover:bg-primary-hover"
              >
                <MapPin className="h-4 w-4" aria-hidden="true" />
                Cómo llegar
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Escribir por WhatsApp al ${formatWhatsAppPhone(WHATSAPP_NUMBER)}`}
                className="inline-flex items-center gap-2 rounded-full border border-border-button px-5 py-2.5 font-body text-sm font-semibold text-text transition-colors hover:border-primary hover:text-primary"
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                Escribinos
              </a>
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border">
            <iframe
              title={`Mapa de ${GYM_LOCATION.street}, ${GYM_LOCATION.city}`}
              src={GYM_LOCATION.mapsEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-full min-h-96 w-full border-0"
            />
          </div>
        </div>
      </Container>
    </section>
  );
};

export default LocationContactSection;
