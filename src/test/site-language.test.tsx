import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteLanguageProvider } from "@/lib/site-language";
import { LanguageSelect } from "@/components/site/LanguageSelect";
import { GuideSection, ContactSection, DownloadSection, Footer } from "@/components/site/Sections";
import { localizedInstallUrl } from "@/lib/site-copy";

beforeEach(() => vi.stubGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); history.replaceState(null, "", "/"); });
describe("Showcase languages", () => {
  it("translates every section and persists the chosen language", async () => {
    const page = () => <SiteLanguageProvider><LanguageSelect /><GuideSection /><ContactSection /><DownloadSection /><Footer /></SiteLanguageProvider>;
    const view = render(page());
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "en"}});
    expect(screen.getByText("Get the app in 4 steps")).toBeTruthy();
    expect(screen.getByText("Email your coach")).toBeTruthy();
    expect(screen.getByText("Install the Team Chtaw app")).toBeTruthy();
    expect(screen.getByText(/Physical exam preparation/)).toBeTruthy();
    expect(localStorage.getItem("chtaw-language")).toBe("en");
    expect(document.documentElement.lang).toBe("en");
    view.unmount(); render(page());
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("en"));
    fireEvent.change(screen.getByRole("combobox"), {target: {value: "fr"}});
    expect(screen.getByText("Télécharger l'application en 4 étapes")).toBeTruthy();
  });
  it("honors the language received from the installation page", async () => {
    history.replaceState(null, "", "/?lang=en");
    render(<SiteLanguageProvider><LanguageSelect /><Footer /></SiteLanguageProvider>);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("en"));
    expect(screen.getByText(/Physical exam preparation/)).toBeTruthy();
  });
  it("passes the language without losing the installation destination", () => {
    expect(localizedInstallUrl("https://teamchtaw-pwa.vercel.app/install", "en")).toBe("https://teamchtaw-pwa.vercel.app/install?lang=en");
    expect(localizedInstallUrl("https://teamchtaw-pwa.vercel.app/install?source=site", "fr")).toBe("https://teamchtaw-pwa.vercel.app/install?source=site&lang=fr");
    expect(localizedInstallUrl("javascript:alert(1)", "en")).toBe("");
  });
});
