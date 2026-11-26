import { InstallationScreen } from "@/components/pwa/installation-screen";

export const metadata = { title: "Installer l’application" };
export default function InstallPage() {
  const available = process.env.NEXT_PUBLIC_APP_AVAILABLE === "true";
  return <InstallationScreen available={available} />;
}
