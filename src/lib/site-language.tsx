import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { translateSite, type SiteLanguage } from "./site-copy";

const SiteLanguageContext = createContext({language: "fr" as SiteLanguage, ready: false, setLanguage: (_language: SiteLanguage) => {}});
export function SiteLanguageProvider({children}: {children: ReactNode}) {
  const [language, setLanguage] = useState<SiteLanguage>("fr");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      try {
        const query = new URLSearchParams(location.search).get("lang");
        const saved = localStorage.getItem("chtaw-language");
        if (query === "fr" || query === "en") localStorage.setItem("chtaw-language", query);
        setLanguage(query === "en" || query === "fr" ? query : saved === "en" ? "en" : "fr");
      } catch {}
    };
    sync(); setReady(true); window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const select = (value: SiteLanguage) => {
    setLanguage(value);
    try { localStorage.setItem("chtaw-language", value); const url = new URL(location.href); url.searchParams.set("lang", value); history.replaceState(history.state, "", url); } catch {}
  };
  return <SiteLanguageContext.Provider value={{language, ready, setLanguage: select}}>{children}</SiteLanguageContext.Provider>;
}
export function useSiteCopy() {
  const context = useContext(SiteLanguageContext);
  return {...context, t: (key: string, values?: Record<string, string | number>) => translateSite(key, context.language, values)};
}
