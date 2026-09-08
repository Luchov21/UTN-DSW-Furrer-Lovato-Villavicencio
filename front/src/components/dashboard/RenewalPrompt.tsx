import Card from '../common/Card';
import Button from '../common/Button';
import { formatDateOnly } from '../../lib/date';
import type { Subscription } from '../../types/subscription';

interface RenewalPromptProps {
  subscription: Subscription;
}

// Shown above "Forma de pago" for a member whose plan has lapsed or is about
// to (see needsRenewal in ./payments) — one obvious way to pay, not a hunt
// through the plans page for the plan they already have.
const RenewalPrompt = ({ subscription }: RenewalPromptProps) => {
  return (
    <Card className="hover:translate-y-0 hover:shadow-lg">
      <h3 className="font-display text-lg font-semibold text-text">
        Renová tu plan
      </h3>
      <p className="mt-2 font-body text-sm text-text-muted">
        Tu plan {subscription.plan?.name ?? ''} vence el{' '}
        {formatDateOnly(String(subscription.endDate).slice(0, 10))}.
      </p>
      <Button
        className="mt-4"
        href={`/checkout?plan=${subscription.planId}&months=1`}
      >
        Pagar ahora
      </Button>
    </Card>
  );
};

export default RenewalPrompt;
