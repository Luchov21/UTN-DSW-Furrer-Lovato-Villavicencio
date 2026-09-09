import { useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { ANNOUNCEMENT } from './landing.data';

// Dismissal is per-tab on purpose: sessionStorage brings the promo back on the
// visitor's next visit, which localStorage would not.
const readDismissed = (): boolean => {
  try {
    return sessionStorage.getItem(ANNOUNCEMENT.storageKey) === 'true';
  } catch (error) {
    // Safari in private mode throws on sessionStorage access. Showing the bar
    // is the harmless outcome, so recover rather than crash the page.
    console.warn('Announcement bar: sessionStorage unavailable', error);
    return false;
  }
};

const TopAnnouncementBar = () => {
  const [isDismissed, setIsDismissed] = useState(readDismissed);

  const dismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem(ANNOUNCEMENT.storageKey, 'true');
    } catch (error) {
      console.warn('Announcement bar: could not persist dismissal', error);
    }
  };

  if (isDismissed) return null;

  return (
    <div className="relative z-50 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-360 items-center justify-center gap-3 px-10 py-2 text-center">
        <Megaphone
          className="h-3.5 w-3.5 shrink-0 text-star"
          aria-hidden="true"
        />
        <p className="font-body text-xs text-star">
          {ANNOUNCEMENT.text}{' '}
          <a
            href={ANNOUNCEMENT.ctaHref}
            className="font-semibold underline underline-offset-2 transition-colors hover:text-text"
          >
            {ANNOUNCEMENT.ctaLabel} →
          </a>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar el aviso"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export default TopAnnouncementBar;
