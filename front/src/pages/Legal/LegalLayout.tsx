import type { ReactNode } from 'react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import Container from '../../components/common/Container';

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

const LegalLayout = ({ title, updatedAt, children }: LegalLayoutProps) => (
  <div className="flex min-h-screen flex-col bg-background text-text">
    <Navbar />
    <main className="flex-1 py-16">
      <Container>
        <article className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-bold text-text">{title}</h1>
          <p className="mt-2 font-body text-sm text-text-muted">
            Última actualización: {updatedAt}
          </p>
          <div className="mt-8 space-y-6 font-body text-sm leading-relaxed text-text-muted [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text">
            {children}
          </div>
        </article>
      </Container>
    </main>
    <Footer />
  </div>
);

export default LegalLayout;
