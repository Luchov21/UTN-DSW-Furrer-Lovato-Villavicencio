import { useLocation } from 'react-router-dom';
import Navbar from '../../components/layout/Navbar';
import CompleteProfileSection from '../../components/complete-profile/CompleteProfileSection';
import Footer from '../../components/layout/Footer';
import { safeReturnTo } from '../../components/checkout/useCheckoutParams';

function CompleteProfile() {
  const location = useLocation();
  // Checkout sends a guest here mid-flow with ?returnTo=/checkout/wallet...
  // so profile completion lands them back where they left off instead of
  // the default /dashboard.
  const returnTo = safeReturnTo(
    new URLSearchParams(location.search).get('returnTo'),
  );

  return (
    <div className="flex min-h-screen flex-col justify-between bg-background text-text">
      <Navbar />
      <main className="flex-1 flex items-center justify-center my-auto">
        <CompleteProfileSection returnTo={returnTo} />
      </main>
      <Footer />
    </div>
  );
}

export default CompleteProfile;
