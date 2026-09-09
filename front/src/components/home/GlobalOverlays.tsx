import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { buildWhatsAppHref } from '../../lib/whatsapp';
import { LANDING_ANCHORS } from './landing.data';
import ScrollToTopButton from './ScrollToTopButton';

const WHATSAPP_HREF = buildWhatsAppHref(
  '¡Hola! Tengo una consulta sobre las clases y los planes.',
);

const TOOLTIP_DELAY_MS = 5000;
const MOBILE_BAR_AFTER_PX = 400;

// Mounted by Home only, never by RootLayout: a floating WhatsApp button over
// the admin panel or the Mercado Pago checkout is noise at best.
const GlobalOverlays = () => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [showMobileBar, setShowMobileBar] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setShowTooltip(true),
      TOOLTIP_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onScroll = () =>
      setShowMobileBar(window.scrollY > MOBILE_BAR_AFTER_PX);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3">
        {showTooltip && (
          <p className="hidden max-w-56 rounded-xl border border-border bg-surface px-3 py-2 font-body text-xs text-text-muted shadow-lg sm:block">
            ¿Tenés dudas sobre las clases o los planes? Escribinos 👋
          </p>
        )}
        <a
          href={WHATSAPP_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escribinos por WhatsApp"
          onMouseEnter={() => setShowTooltip(true)}
          className="rounded-full bg-primary p-4 text-background shadow-xl transition-transform duration-300 hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <MessageCircle className="h-6 w-6" />
        </a>
      </div>

      <ScrollToTopButton />

      {showMobileBar && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 p-3 backdrop-blur-sm md:hidden">
          <a
            href={`#${LANDING_ANCHORS.freePass}`}
            className="flex w-full items-center justify-center rounded-full bg-primary px-6 py-3 font-body font-semibold text-background"
          >
            Quiero mi pase gratis
          </a>
        </div>
      )}
    </>
  );
};

export default GlobalOverlays;
