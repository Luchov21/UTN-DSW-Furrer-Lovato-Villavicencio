// The real number lives in .env, which is not versioned. The fallback is a
// placeholder so the public repo does not expose a personal phone number.
export const WHATSAPP_NUMBER =
  import.meta.env.VITE_WHATSAPP_NUMBER || '5490000000000';

// 5493410000000 -> +54 9 341 000-0000
export const formatWhatsAppPhone = (raw: string): string => {
  const parts = raw.match(/^(\d{2})(9)(\d{3})(\d{3})(\d{4})$/);
  return parts
    ? `+${parts[1]} ${parts[2]} ${parts[3]} ${parts[4]}-${parts[5]}`
    : `+${raw}`;
};

export const buildWhatsAppHref = (message: string): string =>
  `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
