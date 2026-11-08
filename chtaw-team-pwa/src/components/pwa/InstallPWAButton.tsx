"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { useCopy } from "@/lib/i18n";
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}
export function InstallPWAButton({ showStatus = false }: { showStatus?: boolean }) {
  const { t } = useCopy();
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [help, setHelp] = useState(false);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
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
      <Modal open={help} onClose={() => setHelp(false)} title={t("Votre team, à portée de main")}>
        <p>
          {t(
            "Sur iPhone ou iPad, ouvrez cette application dans Safari, touchez Partager, puis « Sur l’écran d’accueil ».",
          )}
        </p>
        <p>
          {t(
            "Sur Android, utilisez Chrome et choisissez « Installer l’application » ou « Ajouter à l’écran d’accueil » dans le menu du navigateur.",
          )}
        </p>
        <p className="muted">
          {t(
            "L’installation dépend du navigateur et nécessite HTTPS en production. L’application reste accessible dans votre navigateur.",
          )}
        </p>
      </Modal>
    </>
  );
}
