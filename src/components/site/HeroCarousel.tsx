import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ChevronLeft, ChevronRight, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import coachImage from "@/assets/coach-hero.png";
import app from "@/assets/slide-app-purple.jpg";
import training from "@/assets/slide-training.jpg";

const SLIDES = [
  {
    img: coachImage,
    kicker: "Votre coach",
    title: ["Un coach", "dédié à", "votre réussite"],
    text: "Des années d'expérience dans la préparation aux examens physiques des concours et des écoles.",
  },
  {
    img: app,
    kicker: "L'application",
    title: ["Votre coach", "dans votre", "poche"],
    text: "Programmes personnalisés, chronomètre, suivi de progression et conseils — partout, tout le temps.",
  },
  {
    img: training,
    kicker: "Ce qu'elle offre",
    title: ["Prépare.", "Progresse.", "Réussis."],
    text: "Vitesse, endurance, force et souplesse : chaque épreuve de votre examen travaillée pas à pas.",
  },
];

export function HeroCarousel() {
  const [i, setI] = useState(0);
  const n = SLIDES.length;

  useEffect(() => {
    const t = setTimeout(() => setI((x) => (x + 1) % n), 6500);
    return () => clearTimeout(t);
  }, [i, n]);

  const s = SLIDES[i] ?? SLIDES[0];
  if (!s) return null;

  return (
    <section id="accueil" className="relative h-[92svh] min-h-[640px] overflow-hidden">
      <AnimatePresence mode="sync">
        <motion.div
          key={i}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.1 }}
        >
          <img
            src={s.img}
            alt={s.kicker}
            width={1600}
            height={912}
            className={`animate-ken-burns h-full w-full object-cover ${i === 0 ? "object-right" : "object-center"}`}
          />
        </motion.div>
      </AnimatePresence>
      <div className="bg-hero-fade absolute inset-0" />
      <div className="track-lines absolute inset-0" />

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-end px-4 pb-24 md:px-8 md:pb-28">
        <AnimatePresence mode="wait">
          <motion.div key={i} exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.4 }}>
            <motion.p
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-4 inline-block rounded-full bg-primary px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground"
            >
              {s.kicker}
            </motion.p>
            <h1 className="font-display text-6xl leading-[0.88] sm:text-8xl md:text-9xl">
              {s.title.map((line, k) => (
                <span key={k} className="block overflow-hidden">
                  <motion.span
                    className={`block ${k === s.title.length - 1 ? "text-brand-gradient" : ""}`}
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 + k * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.5 }}
              className="mt-6 max-w-xl text-lg text-muted-foreground md:text-xl"
            >
              {s.text}
            </motion.p>
          </motion.div>
        </AnimatePresence>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button
            variant="sport"
            size="lg"
            onClick={() =>
              document.getElementById("telechargement")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Obtenir l'application
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => document.getElementById("guide")?.scrollIntoView({ behavior: "smooth" })}
          >
            Lire le guide <ArrowDown />
          </Button>
        </div>

        <div className="absolute bottom-8 right-4 flex items-center gap-4 md:right-8">
          <div className="flex gap-2">
            {SLIDES.map((_, k) => (
              <button
                key={k}
                onClick={() => setI(k)}
                aria-label={`Diapositive ${k + 1}`}
                className="relative h-1 w-12 overflow-hidden rounded-full bg-secondary"
              >
                {k === i && (
                  <motion.span
                    className="absolute inset-y-0 left-0 bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 6.5, ease: "linear" }}
                  />
                )}
                {k < i && <span className="absolute inset-0 bg-primary/60" />}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setI((i - 1 + n) % n)}
            aria-label="Précédent"
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setI((i + 1) % n)}
            aria-label="Suivant"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </section>
  );
}
