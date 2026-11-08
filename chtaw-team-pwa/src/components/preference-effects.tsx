"use client";
import { useEffect, useLayoutEffect } from "react";
import { usePreferences, readPreferences, resolvedTheme } from "@/stores/preferences";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
export function PreferenceEffects() {
  const preferences = usePreferences();
  const { language } = useCopy();
  useLayoutEffect(() => {
    usePreferences.setState(readPreferences());
  }, []);
  useLayoutEffect(() => {
    const apply = () => {
      const theme = resolvedTheme(usePreferences.getState().theme);
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
      useCommunity.setState({ theme });
    };
    apply();
    const system = window.matchMedia?.("(prefers-color-scheme: dark)");
    system?.addEventListener("change", apply);
    const changed = (event: StorageEvent) => {
      if (event.key === "chtaw-theme" || event.key === "chtaw-language")
        usePreferences.setState(readPreferences());
    };
    window.addEventListener("storage", changed);
    return () => {
      system?.removeEventListener("change", apply);
      window.removeEventListener("storage", changed);
    };
  }, [preferences.theme]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return null;
}
