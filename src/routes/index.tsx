import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { GuideSection, ContactSection, DownloadSection, Footer } from "@/components/site/Sections";
import { BRAND } from "@/lib/site";
import { useSiteCopy } from "@/lib/site-language";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: BRAND },
      {
        name: "description",
        content:
          "Découvrez l'application Team Chtaw : programmes, suivi et coaching pour réussir vos examens physiques.",
      },
      { property: "og:title", content: BRAND },
      {
        property: "og:description",
        content: "Programmes, suivi et coaching pour réussir vos examens physiques.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const {t, language} = useSiteCopy();
  useEffect(() => {
    const description = document.querySelector('meta[name="description"]');
    const social = document.querySelector('meta[property="og:description"]');
    description?.setAttribute("content", t("Découvrez l'application Team Chtaw : programmes, suivi et coaching pour réussir vos examens physiques."));
    social?.setAttribute("content", t("Programmes, suivi et coaching pour réussir vos examens physiques."));
  }, [language, t]);
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="pt-20 md:pt-24">
        <HeroCarousel />
        <GuideSection />
        <ContactSection />
        <DownloadSection />
      </main>
      <Footer />
    </div>
  );
}
