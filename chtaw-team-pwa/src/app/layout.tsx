import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/providers";
import { preferenceBootstrap } from "@/lib/preference-bootstrap";
import "@/styles/globals.css";
export const metadata: Metadata = {
  title: { default: "Team Chtaw — Votre collectif, partout", template: "%s · Team Chtaw" },
  description:
    "Votre espace communautaire : conversations, entraînements et esprit d’équipe, en temps réel.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: false, title: "Team Chtaw" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#16062f",
  interactiveWidget: "resizes-content",
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: preferenceBootstrap }} /></head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
