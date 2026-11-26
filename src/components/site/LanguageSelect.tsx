import { useId } from "react";
import { useSiteCopy } from "@/lib/site-language";
import type { SiteLanguage } from "@/lib/site-copy";
export function LanguageSelect() {
  const {t, language, ready, setLanguage} = useSiteCopy();
  const id = useId();
  return <>
    <label className="sr-only" htmlFor={id}>{t("Langue")}</label>
    <select id={id} value={language} disabled={!ready} onChange={event => setLanguage(event.target.value as SiteLanguage)} className="rounded-full border border-border bg-background px-3 py-2 text-sm text-foreground">
      <option value="fr" lang="fr">FR</option><option value="en" lang="en">EN</option>
    </select>
  </>;
}
