import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Mail } from 'lucide-react';
import InputField from '../common/InputField';
import PasswordField from '../common/PasswordField';
import FormAlert from '../common/FormAlert';
import GoogleAuthButton from '../common/GoogleAuthButton';
import LoginSubmitButton from './LoginSubmitButton';
import { useAuth } from '../../context/useAuth';
import { returnPathFrom, type FromLocation } from '../../routes/redirects';

// Simple RFC 5322 regex for client-side email format validation
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface LoginFormProps {
  // Lets an embedding flow (checkout) take over where the member lands next
  // instead of the default redirect. Callers that don't pass it keep the
  // existing behavior unchanged.
  onSuccess?: () => void;
  // Forwarded to GoogleAuthButton. Callers that don't pass it keep the
  // existing behavior unchanged.
  onIncompleteProfile?: () => void;
}

const LoginForm = ({ onSuccess, onIncompleteProfile }: LoginFormProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Determine redirect target (fallback to home /). The search string is
  // part of it: a member sent here from /checkout/wallet?plan=12&months=6
  // carries their whole purchase in the query string, and dropping it lands
  // them on a wallet page with no plan, which bounces them to /membership.
  const from = returnPathFrom(
    (location.state as { from?: FromLocation } | null)?.from,
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const validateForm = (): boolean => {
    let isValid = true;
    setEmailError(null);
    setPasswordError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setEmailError('El correo electrónico es requerido.');
      isValid = false;
    } else if (!EMAIL_REGEX.test(cleanEmail)) {
      setEmailError(
        'Ingresa un correo electrónico válido (ej. usuario@dominio.com).',
      );
      isValid = false;
    }

    if (!password) {
      setPasswordError('La contraseña es requerida.');
      isValid = false;
    } else if (password.length < 8) {
      setPasswordError('La contraseña debe tener al menos 8 caracteres.');
      isValid = false;
    }

    return isValid;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      // login() from AuthContext persists the token/user and updates the global
      // state, so the Navbar reacts immediately without a refresh.
      await login(email, password);

      setSuccess('¡Inicio de sesión exitoso! Redirigiendo...');

      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email.trim());
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      // An embedding flow (checkout) takes over navigation itself; the
      // default redirect-after-a-beat only applies to standalone use.
      if (onSuccess) {
        onSuccess();
      } else {
        setTimeout(() => {
          navigate(from, { replace: true });
        }, 800);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo iniciar sesión. Por favor verifica tus credenciales.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-4" noValidate>
      <FormAlert type="error" message={error} />
      <FormAlert type="success" message={success} />

      <InputField
        id="login-email"
        name="email"
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (emailError) setEmailError(null);
        }}
        placeholder="tu@email.com"
        required
        disabled={isLoading}
        error={emailError}
        icon={<Mail className="h-4 w-4" />}
      />

      <PasswordField
        id="login-password"
        name="password"
        label="Contraseña"
        autoComplete="current-password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (passwordError) setPasswordError(null);
        }}
        disabled={isLoading}
        error={passwordError}
      />

      <div className="flex items-center justify-between text-sm pt-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-text-muted hover:text-text transition-colors">
          <input
            type="checkbox"
            checked={rememberMe}
            disabled={isLoading}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-border bg-surface text-primary focus:ring-primary focus:ring-offset-background disabled:opacity-50 accent-primary"
          />
          <span className="font-body text-xs sm:text-sm">Recordarme</span>
        </label>
        <a
          href="/forgot-password"
          className="font-body text-xs sm:text-sm text-primary hover:text-primary-hover font-semibold transition-colors"
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>

      <LoginSubmitButton isLoading={isLoading} />

      {/* Divider */}
      <div className="relative my-3 flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border"></div>
        </div>
        <span className="relative bg-surface px-3 text-xs uppercase tracking-wider text-text-muted font-body">
          o bien
        </span>
      </div>

      {/* Google Login Button */}
      <GoogleAuthButton
        label="Continuar con Google"
        disabled={isLoading}
        onError={(errMsg) => setError(errMsg)}
        onSuccess={onSuccess}
        onIncompleteProfile={onIncompleteProfile}
      />

      <p className="text-center font-body text-sm text-text-muted pt-2">
        ¿No tienes una cuenta aún?{' '}
        <a
          href="/register"
          className="font-semibold text-primary hover:text-primary-hover transition-colors"
        >
          Regístrate gratis
        </a>
      </p>
    </form>
  );
};

export default LoginForm;
