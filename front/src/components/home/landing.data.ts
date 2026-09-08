import {
  BadgePercent,
  Bike,
  CalendarCheck,
  Clock,
  CreditCard,
  Dumbbell,
  Receipt,
  Repeat,
  ShowerHead,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Everything here is content with no backing table: marketing copy, facility
// photography, FAQ text and the gym's own address and contact details. Entities
// the admin owns — trainers, classes, sessions, plans, prices, plan features —
// are never in this file; they come from the API through useLandingData.
//
// The commercial claims below (no joining fee, extended hours, hot water and
// lockers) come from the author's brief. They are business facts this codebase
// cannot verify — confirm them with the gym before launch.

export const LANDING_ANCHORS = {
  hero: 'inicio',
  freePass: 'pase-gratis',
  disciplines: 'disciplinas',
  schedule: 'horarios',
  facilities: 'instalaciones',
  coaches: 'entrenadores',
  plans: 'planes',
  location: 'ubicacion',
} as const;

export const ANNOUNCEMENT = {
  storageKey: 'flg-announcement-dismissed',
  text: 'Sin costo de matrícula durante todo el mes',
  ctaLabel: 'Ver planes',
  ctaHref: `#${LANDING_ANCHORS.plans}`,
};

export interface ValueProp {
  icon: LucideIcon;
  label: string;
}

// No QR-access or digital-routine claims here: neither feature exists. See the
// spec's Decision 8.
export const VALUE_PROPS: ValueProp[] = [
  { icon: Dumbbell, label: 'Máquinas y peso libre de primera línea' },
  { icon: BadgePercent, label: '0% de costo de matrícula inicial' },
  {
    icon: Clock,
    label: 'Lunes a viernes de 06 a 23 hs · sábados de 08 a 20 hs',
  },
  { icon: CalendarCheck, label: 'Reservá tus clases desde el celular' },
  {
    icon: ShowerHead,
    label: 'Vestuarios con duchas de agua caliente y lockers',
  },
  { icon: Bike, label: 'Clases guiadas todos los días' },
];

export const FREE_PASS_BENEFITS: string[] = [
  'Acceso libre a la sala de musculación y la zona de cardio',
  'Podés sumarte a cualquier clase grupal del día',
  'Un profesor te guía en tus primeros ejercicios',
  'Sin compromiso y sin cargar ninguna tarjeta',
];

export const FREE_PASS_GOALS: string[] = [
  'Musculación',
  'Descenso de peso',
  'Rendimiento deportivo',
  'Salud general',
];

export interface FacilityPhoto {
  src: string;
  alt: string;
}

// The four photographs in front/public/images. The spec's Decision 6 drops the
// sector tabs until there are real photographs for each sector.
export const FACILITY_PHOTOS: FacilityPhoto[] = [
  {
    src: '/images/strength-zone.jpg',
    alt: 'Sala de musculación con peso libre',
  },
  {
    src: '/images/cardio-zone.jpg',
    alt: 'Zona de cardio con cintas y elípticos',
  },
  { src: '/images/group-studio.jpg', alt: 'Salón de clases grupales' },
  { src: '/images/nutrition-bar.jpg', alt: 'Barra de nutrición e hidratación' },
];

export interface AppFeature {
  icon: LucideIcon;
  title: string;
  description: string;
}

// Only features the member portal actually has today: see the dashboard tabs in
// pages/Dashboard/Dashboard.tsx and the checkout flow.
export const APP_FEATURES: AppFeature[] = [
  {
    icon: CalendarCheck,
    title: 'Reservá y cancelá clases',
    description:
      'Elegí tu turno desde el celular y liberalo si no llegás, sin pasar por recepción.',
  },
  {
    icon: CreditCard,
    title: 'Pagá tu cuota online',
    description:
      'Abonás con Mercado Pago desde tu cuenta, con tarjeta guardada si querés.',
  },
  {
    icon: Receipt,
    title: 'Mirá tu historial de pagos',
    description:
      'Todos tus pagos y vencimientos en un solo lugar, siempre disponibles.',
  },
  {
    icon: Repeat,
    title: 'Cambiá de plan cuando quieras',
    description:
      'Si mejorás tu plan pagás solo la diferencia por los días que te quedan.',
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqEntry[] = [
  {
    question: '¿Cómo activo mi pase gratis de 1 día?',
    answer:
      'Completá el formulario de esta página y se abre un chat de WhatsApp con tus datos ya cargados. Te confirmamos el día y venís a entrenar.',
  },
  {
    question: '¿Tengo que pagar costo de inscripción o matrícula?',
    answer:
      'No. No cobramos matrícula ni costo de inscripción: pagás únicamente el plan que elegís.',
  },
  {
    question: '¿Tienen planes sin contrato de permanencia?',
    answer:
      'Sí. Todos los planes son sin permanencia mínima y podés darlos de baja cuando quieras desde tu cuenta.',
  },
  {
    question: '¿Cómo se realiza el pago online?',
    answer:
      'El pago se hace con Mercado Pago desde la web, con tarjeta de crédito o débito. También podés abonar en recepción si preferís.',
  },
  {
    question: '¿Qué necesito para mi primer entrenamiento?',
    answer:
      'Ropa deportiva, calzado limpio para usar adentro, una toalla y tu botella de agua. El resto lo ponemos nosotros.',
  },
];

export const GYM_LOCATION = {
  street: 'Zeballos 1341',
  city: 'Rosario',
  province: 'Santa Fe',
  country: 'AR',
  phoneDisplay: '+54 9 341 272-4611',
  email: 'hola@flg.com.ar',
  mapsUrl:
    'https://www.google.com/maps/search/?api=1&query=Zeballos+1341+Rosario+Santa+Fe',
  mapsEmbedUrl:
    'https://www.google.com/maps?q=Zeballos%201341%2C%20Rosario%2C%20Santa%20Fe&output=embed',
};
