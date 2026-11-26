import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { BRAND } from "@/lib/site";
import { SiteLanguageProvider, useSiteCopy } from "@/lib/site-language";
import { LanguageSelect } from "@/components/site/LanguageSelect";

function NotFoundComponent() {
  const {t} = useSiteCopy();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <LanguageSelect />
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">{t("Page introuvable")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Cette page n’existe pas ou a été déplacée.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Retour à l’accueil")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const {t} = useSiteCopy();
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <LanguageSelect />
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {t("Cette page n’a pas pu être chargée")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Vous pouvez réessayer ou revenir à l’accueil.")}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t("Réessayer")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {t("Retour à l’accueil")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: BRAND },
      { property: "og:title", content: BRAND },
      { name: "twitter:title", content: BRAND },
      {
        name: "description",
        content: "L'application mobile de coaching pour réussir vos examens physiques.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Bebas+Neue&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=team-chtaw-2", sizes: "16x16 32x32 48x48" },
      { rel: "icon", href: "/favicon-16x16.png?v=team-chtaw-2", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32x32.png?v=team-chtaw-2", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-48x48.png?v=team-chtaw-2", type: "image/png", sizes: "48x48" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return <SiteLanguageProvider><RootDocument>{children}</RootDocument></SiteLanguageProvider>;
}

function RootDocument({ children }: { children: ReactNode }) {
  const {language} = useSiteCopy();
  return (
    <html lang={language} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster theme="dark" richColors position="top-center" />
    </QueryClientProvider>
  );
}
