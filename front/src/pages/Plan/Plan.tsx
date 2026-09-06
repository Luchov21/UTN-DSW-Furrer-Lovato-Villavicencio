import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, Loader2, AlertCircle } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import PageHeader from '../../components/common/PageHeader';
import Container from '../../components/common/Container';
import CTASection from '../../components/common/CTASection';
import Button from '../../components/common/Button';
import PlanCard from '../../components/plans/PlanCard';
import {
  enrichBackendPlan,
  type MembershipPlan,
} from '../../components/plans/plans.data';
import { getPlans } from '../../services/plan.service';
import { getMySubscription } from '../../services/subscription.service';
import type { User } from '../../types/user';
import type { Subscription } from '../../types/subscription';

function Plan() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Synchronously initialize currentUser from localStorage
  const [currentUser] = useState<User | null>(() => {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  });

  // The current user's active subscription (self-service; see Dashboard).
  const [activeSubscription, setActiveSubscription] =
    useState<Subscription | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Fetch plans from backend on mount
  useEffect(() => {
    const fetchPlanData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [plansRes, subRes] = await Promise.allSettled([
          getPlans(),
          currentUser ? getMySubscription() : Promise.resolve(null),
        ]);

        // There is no hardcoded fallback: inventing plans hid the failure and
        // let people pick a plan that does not exist in the backend. An empty
        // list is rendered as an empty state further down.
        if (plansRes.status === 'fulfilled') {
          setPlans(plansRes.value.map(enrichBackendPlan));
        } else {
          setPlans([]);
          setError(
            plansRes.reason instanceof Error
              ? plansRes.reason.message
              : 'No se pudieron cargar los planes.',
          );
        }

        if (subRes.status === 'fulfilled') {
          setActiveSubscription(subRes.value);
        }
      } catch (err) {
        setPlans([]);
        setError(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los planes.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlanData();
  }, [currentUser]);

  // Check if current user has an active subscription to a given plan
  const hasActiveSubscriptionToPlan = (planId?: number) => {
    if (!planId || !activeSubscription) return false;
    return (
      Number(activeSubscription.planId) === Number(planId) &&
      activeSubscription.state?.toLowerCase() === 'activa' &&
      !activeSubscription.deleted
    );
  };

  // Everyone goes to the checkout, guest or member: /checkout handles the
  // account step itself, so a guest no longer loses the plan they picked to a
  // detour through /login.
  const handleSelectPlan = (selectedPlan: MembershipPlan) => {
    setActionFeedback(null);

    if (hasActiveSubscriptionToPlan(selectedPlan.id)) {
      setActionFeedback({
        type: 'success',
        message: `Ya tenés una suscripción activa al plan ${selectedPlan.name}.`,
      });
      return;
    }

    navigate(`/checkout?plan=${selectedPlan.id ?? ''}&months=1`);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-text">
      <Navbar />

      <main className="flex-1">
        <PageHeader
          badge="Planes de membresía"
          icon={CreditCard}
          title={
            <>
              Elegí tu <span className="text-primary">plan fitness</span>
            </>
          }
          subtitle="Opciones de membresía flexibles diseñadas para tu estilo de vida y presupuesto. Comenzá tu transformación hoy sin contratos a largo plazo."
        />

        <section className="bg-background py-20">
          <Container>
            {/* Feedback Alert */}
            {actionFeedback && (
              <div
                className={`mx-auto mb-10 max-w-2xl rounded-2xl border p-4 text-center transition-all ${
                  actionFeedback.type === 'success'
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-red-500/30 bg-red-500/10 text-red-400'
                }`}
              >
                <p className="text-sm font-semibold">
                  {actionFeedback.message}
                </p>
              </div>
            )}

            {/* Badges Bar */}
            <div className="mx-auto mb-12 flex max-w-3xl flex-col items-center justify-center gap-4 sm:flex-row sm:gap-8">
              {[
                'Sin contratos de permanencia',
                'Cancelá cuando quieras',
                'Acceso inmediato a la app',
              ].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-full border border-border bg-surface px-5 py-3 text-sm text-text-muted shadow-sm"
                >
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            {/* Stage: Loading, Error, or Plans Grid */}
            {isLoading ? (
              <div className="flex h-64 flex-col items-center justify-center gap-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-sm text-text-muted">
                  Cargando planes de membresía...
                </p>
              </div>
            ) : error ? (
              <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface/50 p-8 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-red-400" />
                <h3 className="mt-4 text-lg font-semibold text-text">
                  Error al cargar planes
                </h3>
                <p className="mt-2 text-sm text-text-muted">{error}</p>
                <Button
                  onClick={() => window.location.reload()}
                  variant="secondary"
                  size="sm"
                  className="mt-6"
                >
                  Reintentar
                </Button>
              </div>
            ) : plans.length === 0 ? (
              <div className="mx-auto max-w-md rounded-2xl border border-border bg-surface/50 p-8 text-center">
                <CreditCard className="mx-auto h-12 w-12 text-text-muted" />
                <h3 className="mt-4 text-lg font-semibold text-text">
                  No hay planes disponibles
                </h3>
                <p className="mt-2 text-sm text-text-muted">
                  Todavía no hay planes de membresía publicados. Escribinos y te
                  contamos las opciones para entrenar con nosotros.
                </p>
                <Button
                  href="/contact"
                  variant="secondary"
                  size="sm"
                  className="mt-6"
                >
                  Contactanos
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-3">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id || plan.name}
                    plan={plan}
                    onSelect={handleSelectPlan}
                    isCurrentSubscription={hasActiveSubscriptionToPlan(plan.id)}
                  />
                ))}
              </div>
            )}
          </Container>
        </section>

        <CTASection
          title="¿Listo para transformar tu entrenamiento?"
          subtitle="Elegí el plan que mejor se adapte a tus objetivos y obtené acceso a todas nuestras facilidades y contenidos exclusivos."
          primaryButton={{ label: 'Unirme ahora', href: '/register' }}
        />
      </main>

      <Footer />
    </div>
  );
}

export default Plan;
