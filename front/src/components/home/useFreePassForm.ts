import { useState } from 'react';
import { buildWhatsAppHref } from '../../lib/whatsapp';

export interface FreePassValues {
  name: string;
  phone: string;
  goal: string;
}

export type FreePassErrors = Partial<Record<keyof FreePassValues, string>>;

const EMPTY: FreePassValues = { name: '', phone: '', goal: '' };

// People type their number with spaces, dashes and parentheses; only the digit
// count is a real constraint. Argentine mobiles are 10 digits without the
// country code, so 8 rejects typos without rejecting valid formats.
const digitsOf = (value: string): string => value.replace(/\D/g, '');

export const validateFreePass = (values: FreePassValues): FreePassErrors => {
  const errors: FreePassErrors = {};

  if (!values.name.trim()) {
    errors.name = 'Escribí tu nombre y apellido.';
  }

  const digits = digitsOf(values.phone);
  if (!digits) {
    errors.phone = 'Escribí tu número de WhatsApp.';
  } else if (digits.length < 8) {
    errors.phone = 'El número tiene que tener al menos 8 dígitos.';
  }

  return errors;
};

export const buildFreePassMessage = (values: FreePassValues): string => {
  const base = `¡Hola! Soy ${values.name.trim()} y quiero mi pase gratis de 1 día. Mi WhatsApp es ${values.phone.trim()}.`;
  const goal = values.goal.trim();
  return goal ? `${base} Mi objetivo es: ${goal}.` : base;
};

/**
 * Form state for the free-pass card. `submit` validates and, when the values
 * are good, returns the WhatsApp URL the caller should open — it does not
 * navigate itself, which keeps the behaviour testable and leaves the decision
 * with the component.
 */
export const useFreePassForm = () => {
  const [values, setValues] = useState<FreePassValues>(EMPTY);
  const [errors, setErrors] = useState<FreePassErrors>({});

  const setField = (field: keyof FreePassValues, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const submit = (): string | null => {
    const found = validateFreePass(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return null;
    return buildWhatsAppHref(buildFreePassMessage(values));
  };

  return { values, errors, setField, submit };
};
