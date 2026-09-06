import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import FormAlert from '../common/FormAlert';
import PlanCard from '../plans/PlanCard';
import { enrichBackendPlan, type MembershipPlan } from '../plans/plans.data';
import { getPlans } from '../../services/plan.service';
import { getMySubscription } from '../../services/subscription.service';
import type { Subscription } from '../../types/subscription';
import { formatDateOnly } from '../../lib/date';

const stateBadge: Record<string, string> = {
  activa: 'bg-primary/10 text-primary border-primary/30',
  pendiente: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  vencida: 'bg-red-500/10 text-red-400 border-red-500/30',
  cancelada: 'bg-text-muted/10 text-text-muted border-border',
};

const PlanSection = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pendingPlan, setPendingPlan] = useState<MembershipPlan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Every setState lives in an async callback, so the effect below only starts
  // the requests instead of updating state while React renders.
  const fetchPlans = () =>
    Promise.allSettled([getPlans(), getMySubscription()])
      .then(([plansRes, subRes]) => {
        // No hardcoded fallback: showing invented plans hid the failure and let
        // people pick a plan that does not exist in the backend.
        if (plansRes.status === 'fulfilled') {
          setPlans(plansRes.value.map(enrichBackendPlan));
        } else {
          setPlans([]);
          setLoadError(
            plansRes.reason instanceof Error
              ? plansRes.reason.message
              : 'No se pudieron cargar los planes.',
          );
        }

        setSubscription(subRes.status === 'fulfilled' ? subRes.value : null);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los planes.',
        );
      })
      .finally(() => setIsLoading(false));

  useEffect(() => {
    void fetchPlans();
  }, []);

  const reload = () => {
    setIsLoading(true);
    setLoadError(null);
    void fetchPlans();
  };

  const handleSelect = (plan: MembershipPlan) => {
    setActionError(null);
    setActionSuccess(null);
    setPendingPlan(plan);
  };

  const confirmChange = () => {
    if (!pendingPlan?.id) return;
    navigate(`/checkout?plan=${pendingPlan.id}&months=1`);
  };

  if (isLoading) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-3 text-text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm">Cargando tu plan...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <Card className="text-center hover:translate-y-0 hover:shadow-lg">
        <AlertCircle className="mx-auto h-10 w-10 text-red-400" />
        <p className="mt-3 text-sm text-text-muted">{loadError}</p>
        <Button onClick={reload} variant="secondary" size="sm" className="mt-4">
          Reintentar
        </Button>
      </Card>
    );
  }

  const currentPlanId = subscription?.planId;
  const currentState = (subscription?.state ?? '').toLowerCase();

  return (
    <div className="space-y-8">
      <FormAlert type="success" message={actionSuccess} />
      <FormAlert type="error" message={actionError} />

      <Card className="hover:translate-y-0 hover:shadow-lg">
        <h3 className="font-display text-lg font-semibold text-text">
          Plan actual
        </h3>
        {subscription ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-display text-2xl font-bold text-text">
                {subscription.plan?.name ?? `Plan #${subscription.planId}`}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Vence el {formatDateOnly(subscription.endDate)}
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                stateBadge[currentState] ?? stateBadge.cancelada
              }`}
            >
              {subscription.state ?? 'Sin estado'}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-text-muted">
            Todavía no tenés un plan activo. Elegí uno abajo para empezar.
          </p>
        )}
      </Card>

      <div>
        <h3 className="font-display text-lg font-semibold text-text">
          Cambiar de plan
        </h3>
        {plans.length === 0 ? (
          <Card className="mt-4 text-center hover:translate-y-0 hover:shadow-lg">
            <p className="text-sm text-text-muted">
              No hay planes disponibles en este momento. Consultá en el gimnasio
              por las opciones vigentes.
            </p>
          </Card>
        ) : (
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id ?? plan.name}
                plan={plan}
                onSelect={handleSelect}
                isCurrentSubscription={
                  !!plan.id &&
                  plan.id === currentPlanId &&
                  currentState === 'activa'
                }
              />
            ))}
          </div>
        )}
      </div>

      {pendingPlan && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <Card className="w-full max-w-md hover:translate-y-0 hover:shadow-lg">
            <h4 className="font-display text-lg font-semibold text-text">
              Confirmar cambio de plan
            </h4>
            <p className="mt-3 text-sm text-text-muted">
              Vas a pasar{' '}
              {subscription
                ? `de "${subscription.plan?.name ?? 'tu plan actual'}" `
                : ''}
              a{' '}
              <span className="font-semibold text-text">
                "{pendingPlan.name}"
              </span>{' '}
              ({pendingPlan.price}
              {pendingPlan.period}). Te llevamos al checkout para completar el
              pago; el cambio se aplica cuando se acredite.
            </p>

            <div className="mt-6 flex gap-3">
              <Button onClick={confirmChange} className="flex-1">
                Confirmar
              </Button>
              <Button variant="secondary" onClick={() => setPendingPlan(null)}>
                Cancelar
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default PlanSection;
