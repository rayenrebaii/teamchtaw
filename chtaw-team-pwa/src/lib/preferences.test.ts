import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { preferenceBootstrap } from "./preference-bootstrap";
import { english, translate } from "./i18n";
describe("Préférences avant affichage et dictionnaires", () => {
  it.each([
    ["dark", false, "dark"],
    ["light", true, "light"],
    ["system", true, "dark"],
    ["system", false, "light"],
  ])("applique %s avant hydratation", (theme, darkSystem, expected) => {
    const root = {
      dataset: {} as Record<string, string>,
      style: {} as Record<string, string>,
      lang: "",
    };
    runInNewContext(preferenceBootstrap, {
      localStorage: { getItem: (key: string) => (key === "chtaw-theme" ? theme : "en") },
      document: { documentElement: root },
      matchMedia: () => ({ matches: darkSystem }),
    });
    expect(root.dataset.theme).toBe(expected);
    expect(root.style.colorScheme).toBe(expected);
    expect(root.lang).toBe("en");
  });
  it("reste utilisable si le stockage est inaccessible", () => {
    expect(() =>
      runInNewContext(preferenceBootstrap, {
        localStorage: {
          getItem: () => {
            throw Error("blocked");
          },
        },
      }),
    ).not.toThrow();
  });
  it("fournit une traduction non vide pour chaque clé et conserve les paramètres", () => {
    for (const [key, value] of Object.entries(english)) {
      expect(value.length).toBeGreaterThan(0);
      expect(translate(key as keyof typeof english, "fr")).toBe(key);
    }
    expect(translate("{count} membres", "en", { count: 3 })).toBe("3 members");
  });
});
