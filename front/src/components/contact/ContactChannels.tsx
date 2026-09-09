import {
  Clock,
  MapPin,
  Phone,
  MessageCircle,
  ArrowUpRight,
} from 'lucide-react';
import {
  buildWhatsAppHref,
  formatWhatsAppPhone,
  WHATSAPP_NUMBER,
} from '../../lib/whatsapp';

const WHATSAPP_DISPLAY = formatWhatsAppPhone(WHATSAPP_NUMBER);
const WHATSAPP_HREF = buildWhatsAppHref(
  'Hola! Quisiera hacer una consulta sobre el gimnasio FLG',
);

const InstagramIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const WhatsAppIcon = ({ className = 'w-6 h-6' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.157 4.228 4.316-1.131zm10.771-4.708c-.144-.24-.528-.384-.768-.504-.24-.12-1.416-.699-1.636-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.015-.374-1.933-1.193-.714-.637-1.196-1.424-1.336-1.664-.14-.24-.015-.37.105-.49.108-.108.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.195-.468-.393-.404-.54-.412l-.46-.008c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.69 2.58 4.1 3.62.57.25 1.02.4 1.37.51.58.18 1.1.16 1.52.1.47-.07 1.416-.58 1.616-1.14.2-.56.2-1.04.14-1.14z" />
  </svg>
);

const ContactChannels = () => {
  return (
    <div className="space-y-6">
      {/* Contact channels card */}
      <div className="bg-surface/90 border border-border/80 rounded-2xl p-6 shadow-xl backdrop-blur-md">
        <h2 className="font-display text-xl font-bold text-text mb-2 flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-primary" />
          Canales de Atención Directa
        </h2>
        <p className="font-body text-xs text-text-muted mb-6">
          ¿Querés una respuesta más rápida? Contactanos a través de nuestras
          redes sociales o chat directo.
        </p>

        <div className="space-y-4">
          {/* WhatsApp Option */}
          <a
            href={WHATSAPP_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Enviar mensaje directo por WhatsApp a ${WHATSAPP_DISPLAY}`}
            className="group flex items-center justify-between p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 hover:bg-emerald-500/10 hover:border-emerald-500/60 transition-all duration-300 shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-inner">
                <WhatsAppIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-text text-base group-hover:text-emerald-400 transition-colors">
                    WhatsApp
                  </span>
                  <span className="bg-emerald-500/20 text-emerald-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    Atención Rápida
                  </span>
                </div>
                <p className="font-body text-xs text-text-muted mt-0.5">
                  Chateá en vivo con el equipo
                </p>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-emerald-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </a>

          {/* Instagram Option */}
          <a
            href="https://instagram.com/flg_gym"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver perfil oficial de Instagram @flg_gym"
            className="group flex items-center justify-between p-4 rounded-xl border border-pink-500/30 bg-linear-to-r from-purple-500/5 via-pink-500/5 to-rose-500/5 hover:border-pink-500/60 transition-all duration-300 shadow-sm"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-linear-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform shadow-md">
                <InstagramIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-text text-base group-hover:text-pink-400 transition-colors">
                    Instagram
                  </span>
                  <span className="bg-pink-500/20 text-pink-400 text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border border-pink-500/30">
                    @flg_gym
                  </span>
                </div>
                <p className="font-body text-xs text-text-muted mt-0.5">
                  Envia un mensaje directo (DM) o consultá novedades
                </p>
              </div>
            </div>
            <ArrowUpRight className="h-5 w-5 text-pink-400 opacity-70 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all shrink-0" />
          </a>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-surface/90 border border-border/80 rounded-2xl p-6 shadow-xl space-y-4 backdrop-blur-md">
        <h3 className="font-display text-base font-bold text-text border-b border-border pb-3 flex items-center justify-between">
          <span>Información de FLG Gym</span>
          <span className="text-[10px] text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md font-body">
            Abierto hoy
          </span>
        </h3>

        <div className="space-y-3.5 font-body text-xs text-text-muted">
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-text block mb-0.5 font-medium">
                Horarios de Atención:
              </strong>
              <span>Lunes a Viernes: 06:00 hs - 23:00 hs</span>
              <br />
              <span>Sábados: 08:00 hs - 20:00 hs</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-text block mb-0.5 font-medium">
                Sede Principal:
              </strong>
              <span>Zeballos 1341, Rosario, Santa Fe</span>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <strong className="text-text block mb-0.5 font-medium">
                Atención Telefónica:
              </strong>
              <span>+54 9 341 272-4611</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactChannels;
