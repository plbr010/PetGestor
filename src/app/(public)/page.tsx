import type { Metadata } from "next";

import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { BenefitsSection } from "@/components/marketing/benefits-section";
import { CtaSection } from "@/components/marketing/cta-section";
import { HeroSection } from "@/components/marketing/hero-section";
import { HowItWorksSection } from "@/components/marketing/how-it-works-section";
import { PricingSection } from "@/components/marketing/pricing-section";
import { MAIN_CONTENT_ID } from "@/config/public-routes";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function HomePage() {
  return (
    <>
      <PublicHeader />
      <main id={MAIN_CONTENT_ID}>
        <HeroSection />
        <BenefitsSection />
        <HowItWorksSection />
        <PricingSection />
        <CtaSection />
      </main>
      <PublicFooter />
    </>
  );
}
