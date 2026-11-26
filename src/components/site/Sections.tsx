import { motion } from "motion/react";
import {
  UserPlus,
  ShieldCheck,
  Users,
  CalendarCheck,
  MessageCircle,
  Mail,
  Download,
  Smartphone,
  Monitor,
  Globe,
  Instagram,
  Facebook,
  Youtube,
  Phone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Reveal, SectionTitle } from "./Reveal";
import { BrandVideo } from "./BrandVideo";
import { PWA_URL, FOOTER_CONTACT, SOCIAL_LINKS } from "@/lib/site";
import { TikTokLogo } from "./icons";
import logo from "@/assets/team-chtaw-logo.png";
import { useSiteCopy } from "@/lib/site-language";
import { localizedInstallUrl } from "@/lib/site-copy";
export { ContactSection } from "./ContactForm";

const STEPS = [
  {
    icon: UserPlus,
    title: "Créez votre compte",
    text: "Renseignez vos informations personnelles et votre établissement dans l’application. Vérifiez votre adresse e-mail si cela vous est demandé.",
  },
  {
    icon: ShieldCheck,
    title: "Attendez la validation",
    text: "L’administration examine votre inscription et vous affecte aux groupes. L’accès aux échanges et aux séances nécessite un compte validé.",
  },
  {
    icon: Users,
    title: "Retrouvez vos groupes",
    text: "Ouvrez vos conversations de groupe pour consulter les messages, les sondages et les séances qui vous sont destinés.",
  },
  {
    icon: CalendarCheck,
    title: "Choisissez votre créneau",
    text: "Votez pour un créneau encore ouvert et disposant de places. Respectez les choix autorisés par la séance ; un horaire commencé ou complet n’est plus disponible.",
  },
  {
    icon: CalendarCheck,
    title: "Consultez vos présences",
    text: "Dans Présences, retrouvez votre calendrier et votre historique personnel de présences et d’absences, renseigné par les organisateurs.",
  },
  {
    icon: MessageCircle,
    title: "Participez aux échanges",
    text: "Écrivez dans vos conversations et répondez aux sondages ouverts de vos groupes, selon les règles de vote affichées.",
  },
];
const INSTALL = [
  {
    icon: Smartphone,
    title: "Android",
    text: "Ouvrez la page d’installation dans un navigateur compatible. Touchez Installer si cette option apparaît, puis confirmez.",
  },
  {
    icon: Smartphone,
    title: "iPhone et iPad",
    text: "Ouvrez l’application avec Safari. Touchez Partager, puis Sur l’écran d’accueil, et confirmez l’ajout.",
  },
  {
    icon: Monitor,
    title: "Ordinateur",
    text: "Si votre navigateur propose l’installation, utilisez son bouton Installer ou son menu. Cette option dépend du navigateur.",
  },
  {
    icon: Globe,
    title: "Dans le navigateur",
    text: "Vous pouvez aussi utiliser l’application directement dans votre navigateur. L’installation est facultative.",
  },
];
export function GuideSection() {
  const { t } = useSiteCopy();
  return (
    <section id="guide" className="track-lines relative py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <SectionTitle
          kicker={t("Guide")}
          title={t("Vos premiers pas avec Chtaw Team")}
          sub={t("De votre inscription à vos séances : suivez le parcours, à votre rythme.")}
        />
        <BrandVideo />
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="min-w-0">
              <Reveal className="h-full" delay={index * 0.04}>
                <div className="h-full rounded-3xl border bg-card p-6 md:p-8">
                  <div className="flex items-center justify-between">
                    <step.icon className="h-7 w-7 text-primary" aria-hidden="true" />
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">
                      {index + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-xl font-bold">{t(step.title)}</h3>
                  <p className="mt-3 leading-relaxed text-muted-foreground">{t(step.text)}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        <div className="mt-16 rounded-3xl border border-primary/30 bg-primary/5 p-6 md:p-10">
          <h3 className="text-2xl font-bold md:text-3xl">
            {t("Installer l’application, si vous le souhaitez")}
          </h3>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Un raccourci sur votre écran d’accueil, ou un accès depuis le navigateur : à vous de choisir.",
            )}
          </p>
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            {INSTALL.map((item) => (
              <div key={item.title} className="flex min-w-0 gap-4">
                <item.icon className="mt-1 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h4 className="text-lg font-bold">{t(item.title)}</h4>
                  <p className="mt-2 text-muted-foreground">{t(item.text)}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant="sport" asChild className="mt-8 h-auto min-h-12 whitespace-normal py-3">
            <a href="#telechargement">{t("Obtenir l’application")}</a>
          </Button>
        </div>
        <p className="mt-10 text-muted-foreground">
          {t("Un souci ou une question ?")}{" "}
          <a href="#contact" className="font-semibold text-primary underline underline-offset-4">
            {t("Nous contacter")}
          </a>
        </p>
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
          initial={false}
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

export function DownloadSection() {
  const { t, language } = useSiteCopy();
  const pwaUrl = localizedInstallUrl(PWA_URL.trim(), language);
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
          kicker={t("Téléchargement")}
          title={
            <>
              {t("Obtenez")} <span className="text-primary">{t("l'application")}</span>
            </>
          }
        />
        <Card
          icon={Download}
          title={t("Installez l'application Team Chtaw")}
          text={t(
            "Cliquez sur Installer l’application, puis confirmez sur la page d’installation. Sur iPhone, utilisez Safari : Partager, puis Sur l’écran d’accueil.",
          )}
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
                  <Download aria-hidden="true" /> {t("Installer l'application")}
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
                <Download aria-hidden="true" /> {t("Installer l'application")}
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              {t("Disponible sur Android et iPhone. Installation depuis votre navigateur.")}
            </p>
            <p className="text-muted-foreground">
              {t(
                "Vous pouvez aussi utiliser l’application directement dans votre navigateur. L’installation est facultative.",
              )}
            </p>
            {!isConfigured && (
              <p id="pwa-unavailable" className="text-sm font-medium text-muted-foreground">
                {t(
                  "Installation indisponible : le lien public de l'application n'est pas encore configuré.",
                )}
              </p>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}

export function Footer() {
  const { t } = useSiteCopy();
  const socialIcons = { Instagram, Facebook, TikTok: TikTokLogo, YouTube: Youtube };
  return (
    <footer className="border-t bg-card/40 py-10">
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="grid gap-8 md:grid-cols-[1fr_auto_auto] md:gap-12">
          <div>
            <img
              src={logo}
              alt="Team Chtaw"
              width={176}
              height={99}
              className="h-auto w-32 object-contain"
            />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("Préparation aux examens physiques")}
            </p>
          </div>
          <nav aria-label={t("Réseaux sociaux")}>
            <p className="mb-4 font-semibold">{t("Suivez-nous")}</p>
            <ul className="flex flex-wrap gap-3">
              {SOCIAL_LINKS.map((link) => {
                const Icon = socialIcons[link.name];
                return (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${link.name} (${t("nouvel onglet")})`}
                      title={link.name}
                      className="flex h-11 w-11 items-center justify-center rounded-full border bg-secondary text-foreground transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="min-w-0">
            <p className="mb-4 font-semibold">{t("Contact")}</p>
            <address className="flex flex-col items-start gap-3 not-italic">
              <a
                href={`mailto:${FOOTER_CONTACT.email}`}
                className="inline-flex min-h-11 max-w-full items-center gap-3 rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Mail className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                <span className="break-all">{FOOTER_CONTACT.email}</span>
              </a>
              <a
                href={FOOTER_CONTACT.phoneHref}
                className="inline-flex min-h-11 items-center gap-3 rounded-md text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Phone className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                {FOOTER_CONTACT.phone}
              </a>
            </address>
          </div>
        </div>
        <p className="mt-8 border-t pt-6 text-sm text-muted-foreground">
          © {new Date().getFullYear()} Team Chtaw
        </p>
      </div>
    </footer>
  );
}
