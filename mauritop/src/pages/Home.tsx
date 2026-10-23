import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";
import ServicesSection from "../components/ServicesSection";
import TrustSection from "../components/TrustSection";
import Footer from "../components/Footer";
import FAQ from "../components/FAQ";
import MauriTopSEOContent from "../components/MauriTopSEOContent";
import { useLanguage } from "../contexts/LanguageContext";
import SEO from "../components/SEO";
import { WhatsAppOffers } from "../components/WhatsAppOffers";

export default function Home() {
  const { isRtl } = useLanguage();
  const location = useLocation();
  
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      const element = document.getElementById(id);
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [location]);

  return (
    <div dir={isRtl ? "rtl" : "ltr"} className="min-h-screen bg-main-bg text-text-primary overflow-x-hidden relative">
      <SEO />
      <div className="w-full max-w-7xl mx-auto px-0 text-center">
        <div className="pt-2 sm:pt-4">
          <WhatsAppOffers />
        </div>
        <div className="pb-8">
          <ServicesSection />
        </div>
      </div>
      <MauriTopSEOContent />
      <FAQ />
      <TrustSection />
      <Footer />
    </div>
  );
}
