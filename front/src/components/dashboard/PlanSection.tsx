import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle } from 'lucide-react';
import Card from '../common/Card';
import Button from '../common/Button';
import FormAlert from '../common/FormAlert';
import PlanCard from '../plans/PlanCard';
import { enrichBackendPlan, type MembershipPlan } from '../plans/plans.data';
import { getPlans } from '../../services/plan.service';
import {
  applyPlanChange,
  cancelScheduledPlanChange,
  getMySubscription,
} from '../../services/subscription.service';
import type { Subscription } from '../../types/subscription';
import { formatDateOnly } from '../../lib/date';
import { usePlanChangeQuotes } from './usePlanChangeQuotes';
import { resolvePlanChangeAction } from './plan-change-action';
import ScheduledPlanBanner from './ScheduledPlanBanner';
import PlanChangeConfirmDialog from './PlanChangeConfirmDialog';

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
  const [isCancellingSchedule, setIsCancellingSchedule] = useState(false);

  const { quotes } = usePlanChangeQuotes(plans, !!subscription);

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

  const confirmChange = async () => {
    if (!pendingPlan?.id) return;

    const action = resolvePlanChangeAction(
      pendingPlan.id,
      !!subscription,
      quotes[pendingPlan.id],
    );

    if (action.type === 'checkout') {
      navigate(action.url);
      return;
    }

    try {
      const result = await applyPlanChange(pendingPlan.id);
      setActionSuccess(
        result.direction === 'lateral'
          ? `Ya estás en ${pendingPlan.name}.`
          : `Vas a pasar a ${pendingPlan.name} el ${formatDateOnly(result.effectiveFrom)}.`,
      );
      setPendingPlan(null);
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'No se pudo cambiar el plan.',
      );
    }
  };

  const handleCancelScheduled = async () => {
    setActionError(null);
    setActionSuccess(null);
    setIsCancellingSchedule(true);
    try {
      await cancelScheduledPlanChange();
      setActionSuccess('Cancelaste el cambio de plan programado.');
      reload();
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : 'No se pudo cancelar el cambio de plan programado.',
      );
    } finally {
      setIsCancellingSchedule(false);
    }
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
  const scheduledPlan = plans.find(
    (p) => p.id === subscription?.scheduledPlanId,
  );
  const pendingQuote = pendingPlan?.id ? quotes[pendingPlan.id] : undefined;

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
        ) : null}
        {scheduledPlan && subscription && (
          <ScheduledPlanBanner
            planName={scheduledPlan.name}
            endDate={subscription.endDate}
            onCancel={handleCancelScheduled}
            isCancelling={isCancellingSchedule}
          />
        )}
        {!subscription && (
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
                quote={plan.id ? quotes[plan.id] : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {pendingPlan && (
        <PlanChangeConfirmDialog
          pendingPlan={pendingPlan}
          subscription={subscription}
          quote={pendingQuote}
          onConfirm={confirmChange}
          onCancel={() => setPendingPlan(null)}
        />
      )}
    </div>
  );
};

export default PlanSection;
