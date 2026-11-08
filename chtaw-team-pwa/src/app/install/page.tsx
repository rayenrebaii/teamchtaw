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
        <p className="muted">Ajoutez Team Chtaw à votre écran d’accueil. Le raccourci ouvrira l’application dans votre navigateur.</p>
        <InstallPWAButton showStatus />
        <div className="install-instructions">
          <h2>Android et ordinateur</h2>
          <p>Dans le menu de Chrome ou Edge, choisissez « Ajouter à l’écran d’accueil » ou « Créer un raccourci », puis confirmez. Sur ordinateur, laissez « Ouvrir dans une fenêtre » désactivé si cette option apparaît.</p>
          <h2>iPhone et iPad</h2>
          <p>Dans Safari, ouvrez l’application puis touchez Partager et « Sur l’écran d’accueil ». Pour l’ouvrir dans Safari, désactivez « Ouvrir comme app web » si cette option apparaît, puis touchez « Ajouter ».</p>
        </div>
        {available ? <Link className="btn btn-secondary" href="/login">Ouvrir l’application</Link> :
          <p className="tiny muted" role="status">L’installation est disponible. L’accès aux comptes et à la messagerie sera ouvert prochainement.</p>}
        <a className="small" href="https://teamchtaw-vitrine.vercel.app">Retour au site</a>
      </section>
    </main>
  );
}
