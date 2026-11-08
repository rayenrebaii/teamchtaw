import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";

export const metadata = { title: "Installer l’application" };
export default function InstallPage() {
  const available = process.env.NEXT_PUBLIC_APP_AVAILABLE === "true";
  return (
    <main className="install-page">
      <section className="panel install-card">
        <BrandLogo />
        <span className="eyebrow">VOTRE TEAM, PARTOUT</span>
        <h1>Installez Team Chtaw</h1>
        <p className="muted">Une icône Team Chtaw sur votre ordinateur ou votre téléphone, pour retrouver votre application en un geste.</p>
        <InstallPWAButton showStatus />
        <div className="install-instructions">
          <h2>Sur ordinateur</h2>
          <p>Cliquez sur Installer l’application, puis enregistrez le raccourci téléchargé sur votre Bureau, ou déplacez-le depuis Téléchargements. Son icône ouvrira Team Chtaw dans votre navigateur.</p>
          <h2>Sur Android</h2>
          <p>Ouvrez cette page dans Chrome ou Edge, cliquez sur Installer l’application et confirmez dans la fenêtre du navigateur. L’icône apparaîtra parmi vos applications.</p>
          <h2>iPhone et iPad</h2>
          <p>Dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Activez « Ouvrir comme app web » si cette option apparaît, puis touchez « Ajouter » pour créer l’icône.</p>
        </div>
        {available ? <Link className="btn btn-secondary" href="/login">Ouvrir l’application</Link> :
          <p className="tiny muted" role="status">L’installation est disponible. L’accès aux comptes et à la messagerie sera ouvert prochainement.</p>}
        <a className="small" href="https://teamchtaw-vitrine.vercel.app">Retour au site</a>
      </section>
    </main>
  );
}
