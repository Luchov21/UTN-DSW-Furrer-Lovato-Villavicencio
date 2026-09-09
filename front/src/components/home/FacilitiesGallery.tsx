import { useState } from 'react';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import FacilityLightbox from './FacilityLightbox';
import { FACILITY_PHOTOS, LANDING_ANCHORS } from './landing.data';

const FacilitiesGallery = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section
      id={LANDING_ANCHORS.facilities}
      aria-labelledby="facilities-heading"
      className="bg-background py-20"
    >
      <Container>
        <div id="facilities-heading">
          <SectionTitle
            badge="Instalaciones"
            title="Mirá dónde vas a entrenar"
            subtitle="Sala de musculación, zona de cardio y salón de clases, tal como los vas a encontrar."
          />
        </div>

        <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FACILITY_PHOTOS.map((photo, index) => (
            <li key={photo.src}>
              <button
                type="button"
                onClick={() => setOpenIndex(index)}
                className="group block w-full overflow-hidden rounded-2xl border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span className="sr-only">Ampliar: {photo.alt}</span>
                <img
                  src={photo.src}
                  alt={photo.alt}
                  loading="lazy"
                  decoding="async"
                  className="aspect-4/3 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </button>
            </li>
          ))}
        </ul>
      </Container>

      {openIndex !== null && (
        <FacilityLightbox
          photos={FACILITY_PHOTOS}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </section>
  );
};

export default FacilitiesGallery;
