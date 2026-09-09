import { useState } from 'react';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import FaqItem from './FaqItem';
import { FAQ_ITEMS } from './landing.data';

const FaqAccordion = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section aria-labelledby="faq-heading" className="bg-bg-secondary py-20">
      <Container>
        <div id="faq-heading">
          <SectionTitle
            badge="Preguntas"
            title="Lo que más nos consultan"
            subtitle="Si te queda alguna duda, escribinos por WhatsApp y te respondemos."
          />
        </div>

        <ul className="mx-auto mt-12 max-w-3xl border-t border-border">
          {FAQ_ITEMS.map((entry, index) => (
            <FaqItem
              key={entry.question}
              entry={entry}
              index={index}
              isOpen={openIndex === index}
              onToggle={toggle}
            />
          ))}
        </ul>
      </Container>
    </section>
  );
};

export default FaqAccordion;
