import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import type { FacilityPhoto } from './landing.data';

interface FacilityLightboxProps {
  photos: FacilityPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

const FacilityLightbox = ({
  photos,
  index,
  onClose,
  onNavigate,
}: FacilityLightboxProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // Remember who opened the dialog so focus can go back there on close;
    // otherwise focus falls to <body> and keyboard users lose their place.
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      returnFocusTo.current?.focus();
    };
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'ArrowRight') {
      onNavigate((index + 1) % photos.length);
      return;
    }
    if (event.key === 'ArrowLeft') {
      onNavigate((index - 1 + photos.length) % photos.length);
      return;
    }
    // The dialog holds three buttons; Tab cycles between them rather than
    // escaping to the page behind, which is still rendered.
    if (event.key === 'Tab') {
      const focusable =
        dialogRef.current?.querySelectorAll<HTMLElement>('button');
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialogRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  };

  const photo = photos[index];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={photo.alt}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar la galería"
        className="absolute right-4 top-4 rounded-full border border-border bg-surface p-2 text-text transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={() => onNavigate((index - 1 + photos.length) % photos.length)}
        aria-label="Foto anterior"
        className="absolute left-4 rounded-full border border-border bg-surface p-2 text-text transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <figure className="max-h-full max-w-4xl">
        <img
          src={photo.src}
          alt={photo.alt}
          className="max-h-[80vh] w-full rounded-2xl object-contain"
        />
        <figcaption className="mt-3 text-center font-body text-sm text-text-muted">
          {photo.alt} ({index + 1}/{photos.length})
        </figcaption>
      </figure>

      <button
        type="button"
        onClick={() => onNavigate((index + 1) % photos.length)}
        aria-label="Foto siguiente"
        className="absolute right-4 rounded-full border border-border bg-surface p-2 text-text transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
};

export default FacilityLightbox;
