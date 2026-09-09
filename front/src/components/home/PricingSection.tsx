import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import Container from '../common/Container';
import SectionTitle from '../common/SectionTitle';
import PlanCard from '../plans/PlanCard';
import { enrichBackendPlan, type MembershipPlan } from '../plans/plans.data';
import LandingSectionShell from './LandingSectionShell';
import { LANDING_ANCHORS } from './landing.data';
import type { Plan } from '../../types/plan';

interface PricingSectionProps {
  plans: Plan[];
  isLoading: boolean;
  error: string | null;
}

const GUARANTEES = [
  'Sin contratos de permanencia',
  'Cancelá cuando quieras',
  'Pagás online con Mercado Pago',
];

const PricingSection = ({ plans, isLoading, error }: PricingSectionProps) => {
  const navigate = useNavigate();

  // Same destination as the /membership page: /checkout owns the account step,
  // so a visitor who is not signed in does not lose the plan they picked.
  const handleSelect = (plan: MembershipPlan) => {
    navigate(`/checkout?plan=${plan.id ?? ''}&months=1`);
  };

  return (
    <section
      id={LANDING_ANCHORS.plans}
      aria-labelledby="pricing-heading"
      className="bg-bg-secondary py-20"
    >
      <Container>
        <div id="pricing-heading">
          <SectionTitle
            badge="Planes"
            title="Elegí tu membresía"
            subtitle="Precios vigentes, cargados por el gimnasio. Los planes de 3, 6 y 12 meses tienen descuento y los elegís al contratar."
          />
        </div>

        <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-center gap-3 sm:flex-row sm:gap-6">
          {GUARANTEES.map((item) => (
            <span
              key={item}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 font-body text-xs text-text-muted"
            >
              <Check
                className="h-3.5 w-3.5 shrink-0 text-primary"
                aria-hidden="true"
              />
              {item}
            </span>
          ))}
        </div>

        <LandingSectionShell
          isLoading={isLoading}
          error={error}
          isEmpty={plans.length === 0}
          emptyTitle="Todavía no hay planes publicados"
          emptyMessage="Escribinos por WhatsApp y te contamos las opciones para entrenar con nosotros."
          skeleton={
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {[0, 1, 2].map((slot) => (
                <div
                  key={slot}
                  className="min-h-[28rem] animate-pulse rounded-3xl border border-border bg-surface"
                />
              ))}
            </div>
          }
        >
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id ?? plan.name}
                plan={enrichBackendPlan(plan)}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </LandingSectionShell>
      </Container>
    </section>
  );
};

export default PricingSection;
