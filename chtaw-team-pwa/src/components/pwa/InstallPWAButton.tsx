"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
type Platform = "windows" | "mac" | "ios" | "android" | "other";
const subscribePlatform = () => () => {};
const serverPlatform = (): Platform => "other";
function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : /Android/.test(ua) ? "android" : /Windows/.test(ua) ? "windows" : /Macintosh|Mac OS/.test(ua) ? "mac" : "other";
}
export function InstallPWAButton({ showStatus = false }: { showStatus?: boolean }) {
  const { t } = useCopy();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const platform = useSyncExternalStore(subscribePlatform, detectPlatform, serverPlatform);
  const [shortcutRequested, setShortcutRequested] = useState(false);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
      setHelp(false);
    };
    const done = () => {
      setInstalled(true);
      setPrompt(null);
    };
    const media = window.matchMedia?.("(display-mode: standalone)");
    const syncInstalled = () =>
      setInstalled(
        !!media?.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      );
    const initial = window.setTimeout(syncInstalled, 0);
    media?.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", done);
    return () => {
      window.clearTimeout(initial);
      media?.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", done);
    };
  }, []);
  if (installed)
    return showStatus ? (
      <p className="installation-status" role="status">
        <CheckCircle2 size={18} aria-hidden="true" />
        {t("Application installée")}
      </p>
    ) : null;
  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => {
          if (platform === "windows" || platform === "mac") {
            const link = document.createElement("a");
            link.href = "/downloads/Team-Chtaw.html";
            link.download = "Team Chtaw.html";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setShortcutRequested(true);
            return;
          }
          if (!prompt) {
            setHelp(true);
            return;
          }
          try {
            await prompt.prompt();
            await prompt.userChoice;
          } catch {
            toast.error(t("Installation non terminée. Utilisez le menu de votre navigateur."));
            setHelp(true);
          } finally {
            setPrompt(null);
          }
        }}
      >
        <Download size={16} />
        {showStatus ? t("Installer l’application") : t("Installer l’app")}
      </Button>
      {(platform === "windows" || platform === "mac") && (
        <p className="small muted" role={shortcutRequested ? "status" : undefined}>
          {shortcutRequested
            ? t("Enregistrez le raccourci téléchargé sur votre Bureau. Un double-clic sur son icône ouvrira Team Chtaw dans votre navigateur.")
            : t("Sur ordinateur, ce bouton télécharge un raccourci à enregistrer sur votre Bureau.")}
        </p>
      )}
      {help && (
        <div className="install-help" role="status">
          {platform === "ios" ? <p>{t("Dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Activez « Ouvrir comme app web » si cette option apparaît, puis touchez Ajouter : l’icône Team Chtaw apparaîtra sur votre écran d’accueil.")}</p> :
            <p>{t("Ouvrez cette page dans Chrome ou Edge, hors navigation privée, puis choisissez « Installer l’application » dans le menu. Si Team Chtaw est déjà installée, retrouvez son icône dans vos applications.")}</p>}
        </div>
      )}
    </>
  );
}
