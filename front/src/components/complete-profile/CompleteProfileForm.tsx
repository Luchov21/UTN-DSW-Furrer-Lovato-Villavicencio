import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { IdCard, Phone } from 'lucide-react';
import InputField from '../common/InputField';
import PasswordField from '../common/PasswordField';
import FormAlert from '../common/FormAlert';
import Button from '../common/Button';
import { useAuth } from '../../context/useAuth';
import { changePassword as changePasswordRequest } from '../../services/auth.service';
import {
  EMPTY_COMPLETE_PROFILE_FORM,
  EMPTY_PASSWORD_CHANGE_FORM,
  findCompleteProfileFormError,
  findPasswordChangeFormError,
  toChangePasswordPayload,
  toCompleteProfilePayload,
  type CompleteProfileForm as FormValues,
  type PasswordChangeForm,
} from './complete-profile';

interface CompleteProfileFormProps {
  // Where to send the member once both gates are clear. Defaults to
  // /dashboard for every caller that doesn't come from checkout.
  returnTo?: string;
}

// Renders whichever of the two gates is still closed — see
// CompleteProfileSection.tsx for when each one applies. A walk-in created
// without a phone and still on the front-desk password sees both sections at
// once and clears both gates in a single submit.
const CompleteProfileForm = ({
  returnTo = '/dashboard',
}: CompleteProfileFormProps) => {
  const navigate = useNavigate();
  const {
    user,
    completeProfile,
    updateUser,
    logout,
    isProfileComplete,
    mustChangePassword,
  } = useAuth();

  const hasExistingDni = user?.dni != null;

  const [form, setForm] = useState<FormValues>({
    ...EMPTY_COMPLETE_PROFILE_FORM,
    dni: hasExistingDni ? String(user?.dni) : '',
    phone: user?.phone ?? '',
  });
  const [passwordForm, setPasswordForm] = useState<PasswordChangeForm>(
    EMPTY_PASSWORD_CHANGE_FORM,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isProfileComplete) {
      const formError = findCompleteProfileFormError(form, hasExistingDni);
      if (formError) {
        setError(formError);
        return;
      }
    }

    if (mustChangePassword) {
      const passwordError = findPasswordChangeFormError(passwordForm);
      if (passwordError) {
        setError(passwordError);
        return;
      }
    }

    setIsLoading(true);
    try {
      // Profile first, only when it's actually incomplete — completeProfile
      // (context) does its own full setSession, including a fresh
      // mustChangePassword claim if that gate is still open too.
      if (!isProfileComplete) {
        await completeProfile(toCompleteProfilePayload(form, hasExistingDni));
      }

      // The password step goes through the service function directly (not
      // the context) — there is no dedicated context method for it. Its
      // result is synced into React state and localStorage via updateUser.
      if (mustChangePassword) {
        const data = await changePasswordRequest(
          toChangePasswordPayload(passwordForm),
        );
        // changePasswordRequest already wrote the full fresh user to
        // localStorage via persistSession. Syncing React state with that same
        // full object (rather than a single-field patch built from the stale
        // pre-request state) keeps the two in agreement instead of relying on
        // them coincidentally matching.
        updateUser(data.user);
      }

      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudieron guardar tus datos.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
      <FormAlert type="error" message={error} />

      {!isProfileComplete && (
        <>
          <InputField
            id="complete-profile-dni"
            name="dni"
            label="DNI"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            icon={<IdCard className="h-4 w-4" />}
            value={form.dni}
            // Write-once: a member who already has one cannot change it here.
            // Correcting it is an admin action.
            disabled={hasExistingDni || isLoading}
            onChange={(e) => setForm({ ...form, dni: e.target.value })}
            placeholder="40123456"
          />

          <InputField
            id="complete-profile-phone"
            name="phone"
            label="Teléfono"
            type="text"
            inputMode="tel"
            autoComplete="tel"
            icon={<Phone className="h-4 w-4" />}
            value={form.phone}
            disabled={isLoading}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="3411234567"
          />
        </>
      )}

      {mustChangePassword && (
        <div
          className={
            isProfileComplete ? undefined : 'border-t border-border pt-4'
          }
        >
          {/* When the profile is already complete, CompleteProfileSection's
              own heading and subtitle already say this — repeating it here
              would just be noise. */}
          {!isProfileComplete && (
            <>
              <h2 className="font-display text-base font-semibold text-text">
                Elegí tu contraseña
              </h2>
              <p className="mt-1 font-body text-xs text-text-muted">
                Estás usando la contraseña que te dieron en el gimnasio.
              </p>
            </>
          )}

          <div className="mt-4 space-y-4">
            <PasswordField
              id="complete-profile-current-password"
              name="currentPassword"
              label="Contraseña actual"
              autoComplete="current-password"
              value={passwordForm.currentPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  currentPassword: e.target.value,
                })
              }
              disabled={isLoading}
            />
            <PasswordField
              id="complete-profile-new-password"
              name="newPassword"
              label="Nueva contraseña"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  newPassword: e.target.value,
                })
              }
              disabled={isLoading}
            />
            <PasswordField
              id="complete-profile-confirm-password"
              name="confirmPassword"
              label="Repetir nueva contraseña"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(e) =>
                setPasswordForm({
                  ...passwordForm,
                  confirmPassword: e.target.value,
                })
              }
              disabled={isLoading}
            />
          </div>
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Guardando...' : 'Guardar y continuar'}
      </Button>

      {/* A member who cannot or will not finish must not be trapped here with
          no way out but clearing localStorage by hand. */}
      <button
        type="button"
        onClick={logout}
        className="w-full text-center font-body text-sm text-text-muted hover:text-text underline cursor-pointer transition-colors"
      >
        Cerrar sesión
      </button>
    </form>
  );
};

export default CompleteProfileForm;
