import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DownloadSection } from "@/components/site/Sections";

const site = vi.hoisted(() => ({ PWA_URL: "", OWNER_EMAIL: "coach@example.com" }));
vi.mock("@/lib/site", () => site);

function renderSection(url: string) {
  site.PWA_URL = url;
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<DownloadSection />);
  document.body.appendChild(container);
  return container;
}

afterEach(() => document.body.replaceChildren());

describe("DownloadSection", () => {
  it.each(["", "#", "URL_PWA_A_CONFIGURER", "javascript:alert(1)"])(
    "disables installation when the public URL is not configured: %s",
    (url) => {
      const section = renderSection(url);
      const button = section.querySelector("button");

      expect(section.querySelectorAll("button")).toHaveLength(1);
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleName("Installer l'application");
      expect(button).toHaveAccessibleDescription(
        /le lien public de l'application n'est pas encore configuré/,
      );
      expect(section.querySelector("a")).toBeNull();
    },
  );

  it("links the single installation action to the configured PWA on every device", () => {
    const url = "https://chatflow.example.test/";
    const section = renderSection(url);
    const link = section.querySelector("a");

    expect(section.querySelectorAll("a")).toHaveLength(1);
    expect(link).toHaveAccessibleName("Installer l'application");
    expect(link).toHaveAttribute("href", url);
    expect(section.querySelector("button")).toBeNull();
    expect(section).toHaveTextContent(
      "Disponible sur Android et iPhone. Installation depuis votre navigateur.",
    );
    expect(section).not.toHaveTextContent("Installation indisponible");
  });
});
