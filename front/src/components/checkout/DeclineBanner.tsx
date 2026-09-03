import { useEffect, useRef } from 'react';
import { AlertCircle, Clock } from 'lucide-react';
import { declineMessage, IN_PROCESS_MESSAGE } from './checkout-messages';
import type { CheckoutResult } from '../../types/checkout';

interface DeclineBannerProps {
  result: CheckoutResult;
}

// Rendered ABOVE the card form with everything else left intact — the plan,
// the term and the accepted checkboxes all stay as they were, so a member
// retries by re-entering a card, never by restarting the checkout.
const DeclineBanner = ({ result }: DeclineBannerProps) => {
  const bannerRef = useRef<HTMLDivElement>(null);
  const isPending = result.status === 'in_process';

  useEffect(() => {
    bannerRef.current?.focus();
  }, [result]);

  const Icon = isPending ? Clock : AlertCircle;

  return (
    <div
      ref={bannerRef}
      role="alert"
      tabIndex={-1}
      className={`flex items-start gap-3 rounded-xl border p-4 outline-none ${
        isPending
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-400'
          : 'border-red-500/30 bg-red-500/10 text-red-400'
      }`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="font-body text-sm leading-snug">
        {isPending ? IN_PROCESS_MESSAGE : declineMessage(result.statusDetail)}
      </p>
    </div>
  );
};

export default DeclineBanner;
