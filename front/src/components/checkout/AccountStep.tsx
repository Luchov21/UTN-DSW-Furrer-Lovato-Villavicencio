import { useState } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import RegisterForm from '../register/RegisterForm';
import LoginForm from '../login/LoginForm';

interface AccountStepProps {
  onAuthenticated: () => void;
  onIncompleteProfile: () => void;
}

// A guest picking a plan should not be bounced to /login and lose the plan
// they picked: both forms live here, inside the checkout, with the summary
// still on screen.
const AccountStep = ({
  onAuthenticated,
  onIncompleteProfile,
}: AccountStepProps) => {
  const [mode, setMode] = useState<'register' | 'login'>('register');

  return (
    <Card className="hover:translate-y-0 hover:shadow-lg">
      <h2 className="font-display text-lg font-semibold text-text">
        {mode === 'register' ? 'Creá tu cuenta' : 'Iniciá sesión'}
      </h2>
      <p className="mt-1 font-body text-sm text-text-muted">
        {mode === 'register'
          ? 'Necesitamos estos datos para asociar tu membresía.'
          : 'Entrá con tu cuenta para continuar con el pago.'}
      </p>

      <div className="mt-5">
        {mode === 'register' ? (
          <RegisterForm
            onSuccess={onAuthenticated}
            onIncompleteProfile={onIncompleteProfile}
          />
        ) : (
          <LoginForm
            onSuccess={onAuthenticated}
            onIncompleteProfile={onIncompleteProfile}
          />
        )}
      </div>

      <Button
        variant="secondary"
        size="sm"
        className="mt-4"
        onClick={() => setMode(mode === 'register' ? 'login' : 'register')}
      >
        {mode === 'register'
          ? '¿Ya tenés cuenta? Iniciá sesión'
          : 'Crear una cuenta nueva'}
      </Button>
    </Card>
  );
};

export default AccountStep;
