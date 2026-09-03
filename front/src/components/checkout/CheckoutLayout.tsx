import type { ReactNode } from 'react';
import Navbar from '../layout/Navbar';
import Footer from '../layout/Footer';
import Container from '../common/Container';
import OrderSummary from './OrderSummary';
import type { CheckoutSummary } from '../../types/checkout';

interface CheckoutLayoutProps {
  title: string;
  subtitle: string;
  summary: CheckoutSummary | null;
  onMonthsChange?: (months: number) => void;
  isBusy?: boolean;
  children: ReactNode;
}

// The summary rail never leaves the screen: on desktop it sticks beside the
// form, on mobile it sits above it. A member should always be able to see
// what they are buying and what it costs.
const CheckoutLayout = ({
  title,
  subtitle,
  summary,
  onMonthsChange,
  isBusy,
  children,
}: CheckoutLayoutProps) => (
  <div className="flex min-h-screen flex-col bg-background text-text">
    <Navbar />
    <main className="flex-1 py-12">
      <Container>
        <h1 className="font-display text-2xl font-bold text-text sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 font-body text-sm text-text-muted">{subtitle}</p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="order-2 lg:order-1">{children}</div>
          <div className="order-1 lg:order-2">
            {summary && (
              <OrderSummary
                summary={summary}
                onMonthsChange={onMonthsChange}
                isBusy={isBusy}
              />
            )}
          </div>
        </div>
      </Container>
    </main>
    <Footer />
  </div>
);

export default CheckoutLayout;
