"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { CalendarDays, ChevronLeft, Globe2, MessageCircle, Monitor, Smartphone, Tablet, Users } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useCopy } from "@/lib/i18n";
import { usePreferences, type Language } from "@/stores/preferences";
import { detectInstallPlatform, InstallPWAButton } from "./InstallPWAButton";
import { InstallationVideo } from "./installation-video";
import styles from "./installation.module.css";

const subscribe = () => () => {};
const serverPlatform = () => "other" as const;
const devices = [
  { id: "desktop", label: "Ordinateur", icon: Monitor, title: "Installer sur ordinateur", steps: ["Ouvrez cette page dans Chrome ou Edge.", "Dans le menu du navigateur, choisissez l’option d’installation.", "Confirmez, puis retrouvez Team Chtaw dans vos applications."] },
  { id: "android", label: "Android", icon: Smartphone, title: "Installer sur Android", steps: ["Ouvrez cette page dans Chrome ou Edge.", "Dans le menu ⋮, choisissez « Installer » ou « Ajouter à l’écran d’accueil ».", "Confirmez pour ajouter l’icône Team Chtaw."] },
  { id: "ios", label: "iPhone / iPad", icon: Tablet, title: "Installer sur iPhone ou iPad", steps: ["Ouvrez cette page dans Safari.", "Touchez Partager, puis « Sur l’écran d’accueil ».", "Activez « Ouvrir comme app web » si proposé, puis « Ajouter »."] },
] as const;
type Device = typeof devices[number]["id"];

export function InstallationScreen({ available }: { available: boolean }) {
  const { t, language } = useCopy();
  const setLanguage = usePreferences(state => state.setLanguage);
  const platform = useSyncExternalStore(subscribe, detectInstallPlatform, serverPlatform);
  const [chosen, setChosen] = useState<Device | null>(null);
  const [guidance, setGuidance] = useState(false);
  const selected = chosen ?? (platform === "ios" || platform === "android" ? platform : "desktop");
  const device = devices.find(value => value.id === selected)!;
  const macSafari = platform === "mac" && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|OPR/.test(navigator.userAgent);
  const steps: readonly string[] = selected === "desktop" && macSafari
    ? ["Ouvrez cette page dans Safari.", "Dans Partager, choisissez « Ajouter au Dock ».", "Confirmez avec « Ajouter » pour retrouver Team Chtaw dans le Dock."]
    : device.steps;
  const prefix = useId();
  const panel = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("lang");
    if (value === "fr" || value === "en") setLanguage(value);
  }, [setLanguage]);
  useEffect(() => { document.title = `${t("Installer Team Chtaw")} · Team Chtaw`; }, [language, t]);
  return <main className={styles.page}>
    <InstallationVideo />
    <header className={styles.header}>
      <a href={`https://teamchtaw-vitrine.vercel.app?lang=${language}`} aria-label="Team Chtaw"><BrandLogo /></a>
      <label className={styles.language}><Globe2 size={16} aria-hidden="true" /><span className={styles.srOnly}>{t("Langue")}</span>
        <select value={language} onChange={event => setLanguage(event.target.value as Language)}><option value="fr">Français</option><option value="en">English</option></select>
      </label>
    </header>
    <div className={styles.content}>
      <section className={styles.presentation} aria-labelledby="installation-title">
        <span className={styles.eyebrow}>{t("VOTRE ESPACE COMMUNAUTAIRE")}</span>
        <h1 id="installation-title">{t("Votre team,")}{" "}<span>{t("partout avec vous.")}</span></h1>
        <p className={styles.description}>{t("Installez Team Chtaw pour retrouver vos messages, vos séances et votre communauté en un geste.")}</p>
        <ul className={styles.features}>
          {[{icon: MessageCircle, label: "Messages"}, {icon: CalendarDays, label: "Séances"}, {icon: Users, label: "Communauté"}].map(({icon: Icon, label}) => <li key={label}><Icon size={18} aria-hidden="true" />{t(label)}</li>)}
        </ul>
      </section>
      <section className={styles.card} aria-label={t("Installer Team Chtaw")}>
        <div className={styles.appIdentity}>
          {/* This is the icon declared by this PWA's manifest. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/app-v2-192.png" width={56} height={56} alt="" />
          <div><h2>Team Chtaw</h2><p>{t("Votre communauté, en un geste.")}</p></div>
        </div>
        <div className={styles.actions}>
          <InstallPWAButton showStatus compact label={t("Installer Team Chtaw")} className={styles.installButton} onInstructions={() => { setGuidance(true); panel.current?.focus({preventScroll: true}); }} />
          {available ? <Link href="/app" className={styles.openApp}>{t("Ouvrir l’application")}</Link> : <p role="status" className={styles.hint}>{t("L’accès aux comptes sera ouvert prochainement.")}</p>}
        </div>
        <div className={styles.instructions}>
          <div className={styles.tabs} role="tablist" aria-label={t("Appareil")}>
            {devices.map(({id, label, icon: Icon}, index) => <button key={id} ref={element => { tabs.current[index] = element; }} type="button" role="tab" id={`${prefix}-${id}`} aria-selected={selected === id} aria-controls={`${prefix}-panel`} tabIndex={selected === id ? 0 : -1}
              onClick={() => setChosen(id)} onKeyDown={event => {
                const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1;
                if (next < 0) return; event.preventDefault(); setChosen(devices[next]!.id); tabs.current[next]?.focus();
              }}><Icon size={17} aria-hidden="true" /><span>{t(label)}</span></button>)}
          </div>
          {guidance && <p role="status" className={styles.guidance}>{t("Suivez les étapes pour votre appareil.")}</p>}
          <div ref={panel} id={`${prefix}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${selected}`} tabIndex={0} className={styles.steps}>
            <h3>{t(device.title)}</h3>
            <ol>{steps.map(step => <li key={step}>{t(step)}</li>)}</ol>
          </div>
        </div>
        <p className={styles.hint}>{t("L’application reste accessible dans votre navigateur.")}</p>
      </section>
    </div>
    <footer className={styles.footer}><a href={`https://teamchtaw-vitrine.vercel.app?lang=${language}`}><ChevronLeft size={16} aria-hidden="true" />{t("Retour au site vitrine")}</a></footer>
  </main>;
}
