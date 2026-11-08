import { motion } from "motion/react";
import {
  GraduationCap,
  UserPlus,
  ShieldCheck,
  Download,
  Smartphone,
  Timer,
  LineChart,
  Dumbbell,
  CalendarCheck,
  MessageCircle,
  Mail,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, SectionTitle } from "./Reveal";
import { OWNER_EMAIL, PWA_URL } from "@/lib/site";
import logo from "@/assets/chtaw-logo.png";

const STEPS = [
  {
    icon: Download,
    title: "Téléchargez",
    text: "Touchez Téléchargement, puis confirmez l’installation dans votre navigateur.",
  },
  {
    icon: UserPlus,
    title: "Inscrivez-vous",
    text: "Créez votre compte dans l'application en indiquant votre école.",
  },
  {
    icon: ShieldCheck,
    title: "Validation",
    text: "Le coach vérifie et valide votre compte depuis l'application.",
  },
  {
    icon: Smartphone,
    title: "Entraînez-vous",
    text: "Une fois validé, accédez à vos programmes et commencez.",
  },
];

const FEATURES = [
  {
    icon: Dumbbell,
    title: "Programmes par épreuve",
    text: "Course, sauts, pompes, gainage… adaptés aux barèmes de votre examen.",
  },
  {
    icon: Timer,
    title: "Chrono & séances guidées",
    text: "Lancez une séance, suivez les consignes, laissez le chrono rythmer l'effort.",
  },
  {
    icon: LineChart,
    title: "Suivi de progression",
    text: "Enregistrez vos performances et visualisez votre évolution semaine après semaine.",
  },
  {
    icon: CalendarCheck,
    title: "Planning d'entraînement",
    text: "Un calendrier jusqu'au jour J, avec rappels de séances.",
  },
  {
    icon: MessageCircle,
    title: "Échange avec le coach",
    text: "Posez vos questions et recevez des conseils personnalisés.",
  },
];

export function GuideSection() {
  return (
    <section id="guide" className="track-lines relative py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle
          kicker="Guide"
          title={
            <>
              Comment ça <span className="text-primary">marche</span>
            </>
          }
          sub="Tout ce qu'il faut savoir pour commencer à vous entraîner avec le coach."
        />

        <Reveal>
          <div className="mb-20 flex flex-col gap-5 rounded-3xl border border-primary/30 bg-primary/5 p-6 md:flex-row md:items-center md:p-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <GraduationCap className="h-7 w-7" />
            </div>
            <div>
              <h3 className="font-display text-3xl">Réservée aux élèves du coach</h3>
              <p className="mt-1 text-muted-foreground">
                L'application est destinée aux étudiants qui souhaitent s'entraîner avec ce coach.
                Lors de l'inscription dans l'application, vous devez obligatoirement{" "}
                <strong className="text-foreground">indiquer votre école</strong>.
              </p>
            </div>
          </div>
        </Reveal>

        <h3 className="mb-8 font-display text-4xl">Télécharger l'application en 4 étapes</h3>
        <div className="mb-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, k) => (
            <Reveal key={s.title} delay={k * 0.1}>
              <motion.div
                whileHover={{ y: -6 }}
                className="group relative h-full overflow-hidden rounded-3xl border bg-card p-6"
              >
                <span className="absolute -right-2 -top-6 font-display text-[9rem] leading-none text-secondary transition-colors group-hover:text-primary/15">
                  {k + 1}
                </span>
                <s.icon className="relative h-8 w-8 text-primary" />
                <h4 className="relative mt-6 text-xl font-bold">{s.title}</h4>
                <p className="relative mt-2 text-muted-foreground">{s.text}</p>
              </motion.div>
            </Reveal>
          ))}
        </div>

        <h3 className="mb-8 font-display text-4xl">Ce que contient l'application</h3>
        <div className="mb-24 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, k) => (
            <Reveal key={f.title} delay={k * 0.08}>
              <div className="flex h-full gap-4 rounded-3xl border bg-card p-6 transition-colors hover:border-primary/50">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                  <f.icon className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold">{f.title}</h4>
                  <p className="mt-1 text-muted-foreground">{f.text}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        <h3 className="mb-8 font-display text-4xl">Utiliser l'application au quotidien</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            [
              "Ouvrez votre séance du jour",
              "Depuis l'accueil, la séance prévue est mise en avant. Touchez « Démarrer ».",
            ],
            [
              "Suivez les consignes",
              "Chaque exercice est expliqué avec durée, répétitions et temps de repos.",
            ],
            [
              "Notez vos résultats",
              "À la fin, saisissez vos performances : l'application calcule votre progression.",
            ],
          ].map(([t, d], k) => (
            <Reveal key={t} delay={k * 0.1}>
              <div className="h-full border-l-2 border-primary pl-5">
                <p className="font-display text-2xl text-primary">0{k + 1}</p>
                <h4 className="mt-1 text-lg font-bold">{t}</h4>
                <p className="mt-1 text-muted-foreground">{d}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-20">
          <div className="flex flex-col items-start justify-between gap-4 rounded-3xl bg-secondary p-8 md:flex-row md:items-center">
            <p className="text-xl font-semibold">
              Un souci ou une question ?{" "}
              <span className="text-muted-foreground">N'hésitez pas à nous contacter.</span>
            </p>
            <Button
              variant="sport"
              onClick={() =>
                document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Nous contacter <ArrowRight />
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Card({
  icon: Icon,
  title,
  text,
  children,
}: {
  icon: typeof Mail;
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <Reveal>
      <div className="relative mx-auto max-w-3xl overflow-hidden rounded-[2rem] border bg-card p-8 text-center md:p-14">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        <motion.div
          initial={{ scale: 0.6, rotate: -10 }}
          whileInView={{ scale: 1, rotate: 0 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 220, damping: 14 }}
          className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow"
        >
          <Icon className="h-9 w-9" />
        </motion.div>
        <h3 className="relative mt-6 font-display text-4xl md:text-5xl">{title}</h3>
        <p className="relative mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{text}</p>
        {children && (
          <div className="relative mt-8 flex flex-wrap justify-center gap-4">{children}</div>
        )}
      </div>
    </Reveal>
  );
}

export function ContactSection() {
  return (
    <section id="contact" className="py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle
          kicker="Contact"
          title={
            <>
              Parlons <span className="text-primary">entraînement</span>
            </>
          }
        />
        <Card
          icon={Mail}
          title="Écrivez au coach"
          text="Une question sur l'application ou votre préparation ? Cliquez ci-dessous : votre messagerie s'ouvrira avec l'adresse du coach déjà remplie."
        >
          {OWNER_EMAIL ? (
            <Button variant="sport" size="lg" asChild>
              <a
                href={`mailto:${OWNER_EMAIL}?subject=${encodeURIComponent("Question — Application Team Chtaw")}`}
              >
                <Mail /> Envoyer un e-mail
              </a>
            </Button>
          ) : (
            <p className="text-sm text-muted-foreground">
              Le contact du coach sera disponible prochainement.
            </p>
          )}
        </Card>
      </div>
    </section>
  );
}

export function DownloadSection() {
  const pwaUrl = PWA_URL.trim();
  let isConfigured = false;
  try {
    isConfigured = new URL(pwaUrl).protocol === "https:";
  } catch {
    // Une URL absente ou invalide ne doit pas produire de lien inactif.
  }

  return (
    <section id="telechargement" className="track-lines py-28 md:py-36">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle
          kicker="Téléchargement"
          title={
            <>
              Obtenez <span className="text-primary">l'application</span>
            </>
          }
        />
        <Card
          icon={Download}
          title="Installez l'application Team Chtaw"
          text="Cliquez sur Installer l’application, puis confirmez sur la page d’installation. Sur iPhone, utilisez Safari : Partager, puis Sur l’écran d’accueil."
        >
          <div className="flex w-full flex-col items-center gap-4">
            {isConfigured ? (
              <Button
                variant="sport"
                size="lg"
                className="h-auto min-h-12 max-w-full whitespace-normal py-3"
                asChild
              >
                <a href={pwaUrl}>
                  <Download aria-hidden="true" /> Installer l'application
                </a>
              </Button>
            ) : (
              <Button
                variant="sport"
                size="lg"
                className="h-auto min-h-12 max-w-full whitespace-normal py-3"
                disabled
                aria-describedby="pwa-unavailable"
              >
                <Download aria-hidden="true" /> Installer l'application
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Disponible sur Android et iPhone. Installation depuis votre navigateur.
            </p>
            {!isConfigured && (
              <p id="pwa-unavailable" className="text-sm font-medium text-muted-foreground">
                Installation indisponible : le lien public de l'application n'est pas encore
                configuré.
              </p>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="border-t py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground md:flex-row md:px-8">
        <img
          src={logo}
          alt="Team Chtaw"
          width={176}
          height={99}
          className="h-auto w-32 object-contain"
        />
        <p>© {new Date().getFullYear()} Team Chtaw — Préparation aux examens physiques</p>
      </div>
    </footer>
  );
}
