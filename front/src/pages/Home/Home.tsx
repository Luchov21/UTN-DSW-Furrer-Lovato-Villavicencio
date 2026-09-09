import { useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import AppPromoSection from '../../components/home/AppPromoSection';
import CoachesSection from '../../components/home/CoachesSection';
import DisciplinesSection from '../../components/home/DisciplinesSection';
import FacilitiesGallery from '../../components/home/FacilitiesGallery';
import FaqAccordion from '../../components/home/FaqAccordion';
import FinalCtaBanner from '../../components/home/FinalCtaBanner';
import GlobalOverlays from '../../components/home/GlobalOverlays';
import HeroSection from '../../components/home/HeroSection';
import LeadMagnetSection from '../../components/home/LeadMagnetSection';
import LocationContactSection from '../../components/home/LocationContactSection';
import PricingSection from '../../components/home/PricingSection';
import ScheduleSection from '../../components/home/ScheduleSection';
import TopAnnouncementBar from '../../components/home/TopAnnouncementBar';
import ValuePropsTicker from '../../components/home/ValuePropsTicker';
import { LANDING_ANCHORS } from '../../components/home/landing.data';
import { useLandingData } from '../../hooks/useLandingData';

function Home() {
  const { classes, typeClasses, sessions, trainers, plans, isLoading, errors } =
    useLandingData();

  // The only state above section level: a discipline card asks the schedule to
  // filter to its class, and the schedule scrolls itself into view.
  const [focusedClassId, setFocusedClassId] = useState<number | null>(null);

  const showScheduleFor = (classId: number) => {
    setFocusedClassId(classId);
    document
      .getElementById(LANDING_ANCHORS.schedule)
      ?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-text">
      <TopAnnouncementBar />
      <Navbar />

      <main className="flex-1">
        <HeroSection
          classes={classes}
          trainers={trainers}
          errors={errors}
          isLoading={isLoading}
        />
        <ValuePropsTicker />
        <LeadMagnetSection />
        <DisciplinesSection
          classes={classes}
          typeClasses={typeClasses}
          sessions={sessions}
          isLoading={isLoading}
          errors={errors}
          onShowSchedule={showScheduleFor}
        />
        <ScheduleSection
          sessions={sessions}
          isLoading={isLoading}
          error={errors.sessions}
          focusedClassId={focusedClassId}
          onClearFocus={() => setFocusedClassId(null)}
        />
        <FacilitiesGallery />
        <CoachesSection
          trainers={trainers}
          isLoading={isLoading}
          error={errors.trainers}
        />
        <PricingSection
          plans={plans}
          isLoading={isLoading}
          error={errors.plans}
        />
        <AppPromoSection />
        <FaqAccordion />
        <LocationContactSection />
        <FinalCtaBanner />
      </main>

      <Footer />
      <GlobalOverlays />
    </div>
  );
}

export default Home;
