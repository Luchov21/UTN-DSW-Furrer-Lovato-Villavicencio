import type {
  ChangePasswordPayload,
  CompleteProfilePayload,
} from '../../types/user';

// dni is a string because an empty number input reads back as NaN, which
// cannot be told apart from a typo. Same reasoning as new-member-wizard.ts.
export interface CompleteProfileForm {
  dni: string;
  phone: string;
}

export const EMPTY_COMPLETE_PROFILE_FORM: CompleteProfileForm = {
  dni: '',
  phone: '',
};

// `hasExistingDni` is true for a member who already has one — a walk-in
// account created at the front desk without a phone reaches this screen too,
// and only needs the phone. Their dni is shown read-only.
//
// Same checks the API runs, so the member sees the problem without a round
// trip. The API is still the authority: a dni another account holds can only
// be discovered there.
export const findCompleteProfileFormError = (
  form: CompleteProfileForm,
  hasExistingDni: boolean,
): string | null => {
  if (!hasExistingDni) {
    const dni = form.dni.trim();
    if (!dni) return 'El DNI es obligatorio.';
    if (!/^\d+$/.test(dni) || Number(dni) <= 0) {
      return 'El DNI tiene que ser un número entero.';
    }
    if (dni.length < 7 || dni.length > 8) {
      return 'El DNI tiene que tener 7 u 8 dígitos.';
    }
  }

  const phone = form.phone.trim();
  if (!phone) return 'El teléfono es obligatorio.';
  if (phone.length < 6) return 'El teléfono no parece válido.';

  return null;
};

export const toCompleteProfilePayload = (
  form: CompleteProfileForm,
  hasExistingDni: boolean,
): CompleteProfilePayload => {
  const phone = form.phone.trim();

  return hasExistingDni
    ? { phone }
    : { dni: Number(form.dni.trim()), phone };
};

// The password half of this screen — shown when `mustChangePassword` is set,
// alongside or instead of the profile fields above.
export interface PasswordChangeForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export const EMPTY_PASSWORD_CHANGE_FORM: PasswordChangeForm = {
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
};

// Same rules ProfileForm.tsx applies to its own (optional) password change —
// here the fields are mandatory, since reaching this branch means the member
// is still on the temporary password the gym gave them.
export const findPasswordChangeFormError = (
  form: PasswordChangeForm,
): string | null => {
  if (!form.currentPassword) return 'Ingresá tu contraseña actual.';
  if (form.newPassword.length < 8) {
    return 'La nueva contraseña debe tener al menos 8 caracteres.';
  }
  if (form.newPassword !== form.confirmPassword) {
    return 'Las contraseñas no coinciden.';
  }
  return null;
};

export const toChangePasswordPayload = (
  form: PasswordChangeForm,
): ChangePasswordPayload => ({
  currentPassword: form.currentPassword,
  newPassword: form.newPassword,
});
