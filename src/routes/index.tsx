import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/site/Navbar";
import { HeroCarousel } from "@/components/site/HeroCarousel";
import { GuideSection, ContactSection, DownloadSection, Footer } from "@/components/site/Sections";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Team Chtaw — Votre coach pour les examens physiques" },
      {
        name: "description",
        content:
          "Découvrez l'application Team Chtaw : programmes, suivi et coaching pour réussir vos examens physiques.",
      },
      { property: "og:title", content: "Team Chtaw — Votre coach pour les examens physiques" },
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
