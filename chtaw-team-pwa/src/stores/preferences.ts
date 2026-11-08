"use client";
import { create } from "zustand";
export type Language = "fr" | "en";
export type ThemePreference = "light" | "dark" | "system";
export function readPreferences() {
  let theme: ThemePreference = "light";
  let language: Language = "fr";
  try {
    const savedTheme = localStorage.getItem("chtaw-theme");
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "system")
      theme = savedTheme;
    if (localStorage.getItem("chtaw-language") === "en") language = "en";
  } catch {}
  return { theme, language };
}
export function resolvedTheme(theme: ThemePreference): "dark" | "light" {
  return theme === "system"
    ? typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : theme;
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}
export const usePreferences = create<{
  theme: ThemePreference;
  language: Language;
  setTheme: (theme: ThemePreference) => void;
  setLanguage: (language: Language) => void;
}>((set) => ({
  theme: "light",
  language: "fr",
  setTheme: (theme) => {
    save("chtaw-theme", theme);
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolvedTheme(theme);
      document.documentElement.style.colorScheme = resolvedTheme(theme);
    }
    set({ theme });
  },
  setLanguage: (language) => {
    save("chtaw-language", language);
    set({ language });
  },
}));
