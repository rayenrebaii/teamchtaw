import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallationScreen } from "./installation-screen";
import { usePreferences } from "@/stores/preferences";
import { translate } from "@/lib/i18n";

afterEach(() => { cleanup(); vi.restoreAllMocks(); usePreferences.setState({language: "fr"}); history.replaceState(null, "", "/"); });

describe.each(["fr", "en"] as const)("Installation page in %s", language => {
  const t = (key: string) => translate(key, language);
  function setup() { usePreferences.setState({language}); return render(<InstallationScreen available />); }
  it("shows one device's instructions, real app links and localized content", () => {
    setup();
    expect(screen.getByRole("heading", {level: 1}).textContent).toBe(t("Votre team, partout avec vous."));
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("link", {name: t("Ouvrir l’application")}).getAttribute("href")).toBe("/app");
    expect(screen.getByRole("link", {name: t("Retour au site vitrine")}).getAttribute("href")).toBe(`https://teamchtaw-vitrine.vercel.app?lang=${language}`);
    fireEvent.click(screen.getByRole("tab", {name: "iPhone / iPad"}));
    expect(screen.getByRole("tabpanel").textContent).toContain("Safari");
    expect(screen.getByRole("tabpanel").textContent).not.toContain("Chrome");
    fireEvent.keyDown(screen.getByRole("tab", {name: "iPhone / iPad"}), {key: "Home"});
    expect(screen.getByRole("tab", {name: t("Ordinateur")}).getAttribute("aria-selected")).toBe("true");
  });
  it("offers manual instructions without claiming an installation", () => {
    setup();
    fireEvent.click(screen.getByRole("button", {name: t("Installer Team Chtaw")}));
    expect(screen.getByRole("status").textContent).toBe(t("Suivez les étapes pour votre appareil."));
    expect(screen.queryByText(t("Application installée"))).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("tabpanel"));
  });
  it("waits for appinstalled even after the native prompt is accepted", async () => {
    setup();
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", {cancelable: true}), {prompt, userChoice: Promise.resolve({outcome: "accepted"})});
    act(() => window.dispatchEvent(event));
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", {name: t("Installer Team Chtaw")})); });
    expect(prompt).toHaveBeenCalledOnce();
    expect(screen.queryByText(t("Application installée"))).toBeNull();
    act(() => window.dispatchEvent(new Event("appinstalled")));
    expect(screen.getByRole("status").textContent).toContain(t("Application installée"));
    expect(screen.queryByRole("button", {name: t("Installer Team Chtaw")})).toBeNull();
  });
  it("keeps manual instructions after dismissing the native prompt", async () => {
    setup();
    const event = Object.assign(new Event("beforeinstallprompt", {cancelable: true}), {prompt: vi.fn().mockResolvedValue(undefined), userChoice: Promise.resolve({outcome: "dismissed"})});
    act(() => window.dispatchEvent(event));
    await act(async () => { fireEvent.click(screen.getByRole("button", {name: t("Installer Team Chtaw")})); });
    expect(screen.queryByText(t("Application installée"))).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(t("Suivez les étapes pour votre appareil."));
  });
});

it.each([
  ["Mozilla/5.0 (Linux; Android 15) Chrome/140", "Android"],
  ["Mozilla/5.0 (iPhone) Safari/605", "iPhone / iPad"],
  ["Mozilla/5.0 (Windows NT 10.0) Chrome/140", "Ordinateur"],
])("detects the device: %s", (agent, tab) => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(agent);
  render(<InstallationScreen available />);
  expect(screen.getByRole("tab", {name: tab}).getAttribute("aria-selected")).toBe("true");
});

it("switches the whole page using the existing language preference", () => {
  render(<InstallationScreen available />);
  fireEvent.change(screen.getByRole("combobox"), {target: {value: "en"}});
  expect(screen.getByRole("heading", {level: 1}).textContent).toBe("Your team, wherever you go.");
  expect(screen.getByRole("button", {name: "Install Team Chtaw"})).toBeTruthy();
  expect(screen.getByRole("tabpanel").textContent).not.toContain("Ouvrez");
});

it("keeps the language received from the showcase", () => {
  history.replaceState(null, "", "/install?lang=en");
  render(<InstallationScreen available />);
  expect(screen.getByRole("button", {name: "Install Team Chtaw"})).toBeTruthy();
  expect(screen.getByRole("link", {name: "Back to the website"}).getAttribute("href")).toContain("lang=en");
});

it("offers Add to Dock on desktop Safari", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/18.0 Safari/605.1.15");
  render(<InstallationScreen available />);
  expect(screen.getByRole("tabpanel").textContent).toContain("Ajouter au Dock");
  expect(screen.getByRole("tabpanel").textContent).not.toContain("Chrome");
});

it("recognizes an iPad using its desktop user agent", () => {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15");
  vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
  const original = Object.getOwnPropertyDescriptor(navigator, "maxTouchPoints");
  Object.defineProperty(navigator, "maxTouchPoints", {value: 5, configurable: true});
  try {
    render(<InstallationScreen available />);
    expect(screen.getByRole("tab", {name: "iPhone / iPad"}).getAttribute("aria-selected")).toBe("true");
  } finally {
    if (original) Object.defineProperty(navigator, "maxTouchPoints", original);
    else Reflect.deleteProperty(navigator, "maxTouchPoints");
  }
});

it("shows the installed state when running in standalone mode", async () => {
  const original = Object.getOwnPropertyDescriptor(window, "matchMedia");
  Object.defineProperty(window, "matchMedia", {configurable: true, value: () => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()})});
  try {
    render(<InstallationScreen available />);
    expect(await screen.findByText("Application installée")).toBeTruthy();
    expect(screen.queryByRole("button", {name: "Installer Team Chtaw"})).toBeNull();
    expect(screen.getByRole("link", {name: "Ouvrir l’application"})).toBeTruthy();
  } finally {
    if (original) Object.defineProperty(window, "matchMedia", original);
    else Reflect.deleteProperty(window, "matchMedia");
  }
});
