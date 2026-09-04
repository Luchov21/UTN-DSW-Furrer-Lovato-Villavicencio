import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/useAuth';

// GSI only calls onError when Google answers without a credential. If the flow
// breaks earlier — unauthorised origin, popup blocked by the browser, an
// extension that breaks the handshake, or the user closing the window — it calls
// nothing at all: the button goes quiet and the screen shows no error. These two
// deadlines turn that silence into a message.

// Backstop: there was a click but nothing opened and nothing came back.
const UNRESOLVED_TIMEOUT_MS = 45_000;
// The user came back from Google's window and the credential never arrived.
const RETURN_TIMEOUT_MS = 5_000;

interface GoogleAuthButtonProps {
  label?: string;
  disabled?: boolean;
  onSuccess?: () => void;
  onError?: (error: string) => void;
  // An embedding flow (checkout) takes over the incomplete-profile redirect
  // so the purchase is not lost. Without it this component navigates to
  // /complete-profile with no returnTo, and the plan and term in the URL go
  // with it. Callers that don't pass it keep the existing behavior.
  onIncompleteProfile?: () => void;
}

const GoogleAuthButton = ({
  label = 'Continuar con Google',
  disabled = false,
  onSuccess,
  onError,
  onIncompleteProfile,
}: GoogleAuthButtonProps) => {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // onError arrives as an inline arrow from the form, so it changes on every
  // render; the ref keeps the timers from holding a stale version.
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const unresolvedTimerRef = useRef<number | null>(null);
  const returnTimerRef = useRef<number | null>(null);
  // A click is waiting to resolve: success, error or timeout.
  const awaitingRef = useRef(false);
  // The window lost focus, so Google's popup did open.
  const blurredRef = useRef(false);

  const clearPending = () => {
    if (unresolvedTimerRef.current !== null) {
      window.clearTimeout(unresolvedTimerRef.current);
      unresolvedTimerRef.current = null;
    }
    if (returnTimerRef.current !== null) {
      window.clearTimeout(returnTimerRef.current);
      returnTimerRef.current = null;
    }
    awaitingRef.current = false;
    blurredRef.current = false;
  };

  // A heuristic, not a diagnosis: we do not know why the flow broke, only that
  // it never answered. That is why the message suggests retrying instead of
  // asserting a cause.
  const reportUnresolvedFlow = () => {
    if (!awaitingRef.current) return;
    clearPending();
    const msg =
      'No se pudo completar el inicio de sesión con Google. Intentá de nuevo o ingresá con tu email y contraseña.';
    setLocalError(msg);
    onErrorRef.current?.(msg);
  };

  const handleGoogleClick = () => {
    setLocalError(null);
    // If a click is already unresolved the backstop is not restarted: somebody
    // clicking a dead button repeatedly would postpone it forever.
    if (awaitingRef.current) return;
    awaitingRef.current = true;
    blurredRef.current = false;
    unresolvedTimerRef.current = window.setTimeout(
      reportUnresolvedFlow,
      UNRESOLVED_TIMEOUT_MS,
    );
  };

  useEffect(() => {
    const handleBlur = () => {
      if (awaitingRef.current) blurredRef.current = true;
    };

    // This only counts as "came back without a credential" if a popup opened
    // first. With FedCM the account chooser is browser UI and the page never
    // loses focus, so only the long backstop applies there.
    const handleFocus = () => {
      if (!awaitingRef.current || !blurredRef.current) return;
      if (returnTimerRef.current !== null) return;
      returnTimerRef.current = window.setTimeout(
        reportUnresolvedFlow,
        RETURN_TIMEOUT_MS,
      );
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      clearPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const isConfigured =
    Boolean(clientId) &&
    clientId !== 'your-google-client-id.apps.googleusercontent.com';

  const handleGoogleSuccess = async (
    credentialResponse: CredentialResponse,
  ) => {
    clearPending();

    if (!credentialResponse.credential) {
      const msg = 'No se recibió la credencial de Google.';
      setLocalError(msg);
      onError?.(msg);
      return;
    }

    setLoading(true);
    setLocalError(null);

    try {
      // loginWithGoogle (AuthContext) persists token+user in localStorage and
      // updates the global state, so the Navbar reacts without a reload.
      const data = await loginWithGoogle(credentialResponse.credential);

      // A brand-new Google account has no dni and no phone. Going home first
      // and bouncing off ProtectedRoute would flash a page they cannot use.
      if (!data.user.profileComplete) {
        if (onIncompleteProfile) {
          onIncompleteProfile();
        } else {
          navigate('/complete-profile', { replace: true });
        }
      } else if (onSuccess) {
        onSuccess();
      } else {
        navigate('/');
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error al iniciar sesión con Google';
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    clearPending();
    const msg =
      'La autenticación con Google ha fallado o fue cancelada por el usuario.';
    setLocalError(msg);
    onError?.(msg);
  };

  if (!isConfigured) {
    return (
      <div className="w-full space-y-2">
        <button
          type="button"
          disabled={disabled || loading}
          onClick={() => {
            const msg =
              'Por favor configura tu GOOGLE_CLIENT_ID en el archivo .env de la aplicación.';
            setLocalError(msg);
            onError?.(msg);
          }}
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-border bg-surface hover:bg-surface-hover hover:border-primary/40 py-3 px-4 font-body text-sm font-semibold text-text shadow-sm transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          <svg
            className="h-5 w-5 shrink-0 transition-transform group-hover:scale-105"
            viewBox="0 0 24 24"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>{label}</span>
        </button>
        {!onError && localError && (
          <p className="text-xs text-amber-400 text-center font-body animate-fadeIn">
            {localError}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center gap-2">
      {loading ? (
        <div className="w-full flex items-center justify-center py-3 px-4 rounded-xl border border-border bg-surface text-sm text-text-muted font-body gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span>Iniciando sesión con Google...</span>
        </div>
      ) : (
        <div
          className={`w-full flex justify-center ${disabled ? 'pointer-events-none opacity-50' : ''}`}
        >
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            click_listener={handleGoogleClick}
            theme="outline"
            size="large"
            width="320"
            text="continue_with"
          />
        </div>
      )}
      {/* When the parent takes onError it already shows the message (FormAlert);
          pintamos aca cuando el boton se usa suelto, sin nadie que lo reporte. */}
      {!onError && localError && (
        <p className="text-xs text-red-400 text-center font-body animate-fadeIn">
          {localError}
        </p>
      )}
    </div>
  );
};

export default GoogleAuthButton;
