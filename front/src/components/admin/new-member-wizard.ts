import type { AdminCreateUserPayload, AdminCreatedUser } from '../../services/user.service';

// dni is a string because an empty number input reads back as NaN, which
// cannot be told apart from a typo.
export interface NewMemberForm {
  dni: string;
  name: string;
  surname: string;
  phone: string;
  email: string;
  password: string;
}

export const EMPTY_NEW_MEMBER_FORM: NewMemberForm = {
  dni: '',
  name: '',
  surname: '',
  phone: '',
  email: '',
  password: '',
};

export type WizardStep = 'datos' | 'cobro' | 'clase' | 'resumen';

// Cobro sits before clase on purpose: the plan is chosen inside the charge
// now, and MemberClassStep needs that plan's maxClasses. It is also the real
// counter order — pay, then pick a schedule.
export const WIZARD_STEPS: { id: WizardStep; label: string }[] = [
  { id: 'datos', label: 'Datos' },
  { id: 'cobro', label: 'Cobro' },
  { id: 'clase', label: 'Clase' },
  { id: 'resumen', label: 'Resumen' },
];

// Guards against a stale MemberChargeForm submission resolving after the
// admin has already advanced past 'cobro' (the skip button, or simply
// finishing fast) — same race class the old nextStepAfterPlanAssigned
// guarded against for the deleted plan step.
export const nextStepAfterCharge = (current: WizardStep): WizardStep =>
  current === 'cobro' ? 'clase' : current;

// Same checks the API runs, so the admin sees the problem without a round trip.
export const findNewMemberFormError = (form: NewMemberForm): string | null => {
  const dni = form.dni.trim();
  if (!dni) return 'El DNI es obligatorio.';
  if (!/^\d+$/.test(dni) || Number(dni) <= 0) {
    return 'El DNI tiene que ser un número entero.';
  }
  if (dni.length < 7 || dni.length > 8) {
    return 'El DNI tiene que tener 7 u 8 dígitos.';
  }
  if (!form.name.trim() || !form.surname.trim()) {
    return 'Nombre y apellido son obligatorios.';
  }

  const email = form.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'El email no parece válido.';
  }

  const password = form.password.trim();
  if (password && password.length < 8) {
    return 'La contraseña tiene que tener al menos 8 caracteres.';
  }

  return null;
};

// Optional fields are omitted, never sent empty: AdminCreateUserDto validates
// `email` with @IsEmail and `password` with @MinLength(8), so '' is a 400.
export const toAdminCreateUserPayload = (
  form: NewMemberForm,
): AdminCreateUserPayload => {
  const phone = form.phone.trim();
  const email = form.email.trim();
  const password = form.password.trim();

  return {
    dni: Number(form.dni.trim()),
    name: form.name.trim(),
    surname: form.surname.trim(),
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(password ? { password } : {}),
  };
};

// The username is always the login email — a walk-in's is the
// `<dni>@presencial.flg` placeholder the backend filled in. Null means the
// admin typed the password themselves, so there is nothing to show or print.
export const credentialsFor = (
  user: AdminCreatedUser,
): { username: string; password: string } | null =>
  user.generatedPassword
    ? { username: user.email, password: user.generatedPassword }
    : null;
