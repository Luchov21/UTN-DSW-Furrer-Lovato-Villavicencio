import { ChevronDown } from 'lucide-react';
import type { FaqEntry } from './landing.data';

interface FaqItemProps {
  entry: FaqEntry;
  index: number;
  isOpen: boolean;
  onToggle: (index: number) => void;
}

const FaqItem = ({ entry, index, isOpen, onToggle }: FaqItemProps) => (
  <li className="border-b border-border">
    <h3>
      <button
        type="button"
        id={`faq-trigger-${index}`}
        aria-expanded={isOpen}
        aria-controls={`faq-panel-${index}`}
        onClick={() => onToggle(index)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left font-body text-base font-medium text-text transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {entry.question}
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-primary transition-transform duration-300 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
    </h3>
    <div
      id={`faq-panel-${index}`}
      role="region"
      aria-labelledby={`faq-trigger-${index}`}
      hidden={!isOpen}
      className="pb-5 font-body text-sm leading-relaxed text-text-muted"
    >
      {entry.answer}
    </div>
  </li>
);

export default FaqItem;
