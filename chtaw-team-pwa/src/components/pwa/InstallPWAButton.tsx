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
export function detectInstallPlatform(): Platform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : /Android/.test(ua) ? "android" : /Windows/.test(ua) ? "windows" : /Macintosh|Mac OS/.test(ua) ? "mac" : "other";
}
export function InstallPWAButton({ showStatus = false, compact = false, label, className, onInstructions }: {
  showStatus?: boolean;
  compact?: boolean;
  label?: string;
  className?: string;
  onInstructions?: () => void;
}) {
  const { t } = useCopy();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const platform = useSyncExternalStore(subscribePlatform, detectInstallPlatform, serverPlatform);
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
        variant={compact ? "default" : "secondary"}
        className={className}
        disabled={busy}
        onClick={async () => {
          if (!prompt) {
            setHelp(true);
            onInstructions?.();
            return;
          }
          try {
            setBusy(true);
            await prompt.prompt();
            const choice = await prompt.userChoice;
            if (choice.outcome !== "accepted") { setHelp(true); onInstructions?.(); }
          } catch {
            toast.error(t("Installation non terminée. Utilisez le menu de votre navigateur."));
            setHelp(true);
            onInstructions?.();
          } finally {
            setPrompt(null);
            setBusy(false);
          }
        }}
      >
        <Download size={16} />
        {busy ? t("Confirmez dans le navigateur…") : label ?? (showStatus ? t("Installer l’application") : t("Installer l’app"))}
      </Button>
      {!compact && (platform === "windows" || platform === "mac") && (
        <p className="small muted">
          {t("Confirmez l’installation dans Chrome ou Edge. Si le navigateur propose « Créer un raccourci sur le Bureau », activez cette option pour retrouver l’icône Team Chtaw sur votre Bureau.")}
        </p>
      )}
      {help && !compact && (
        <div className="install-help" role="status">
          {platform === "ios" ? <p>{t("Dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Activez « Ouvrir comme app web » si cette option apparaît, puis touchez Ajouter : l’icône Team Chtaw apparaîtra sur votre écran d’accueil.")}</p> :
            <p>{t("Ouvrez cette page dans Chrome ou Edge, hors navigation privée, puis choisissez « Installer l’application » dans le menu. Si Team Chtaw est déjà installée, retrouvez son icône dans vos applications.")}</p>}
        </div>
      )}
    </>
  );
}
