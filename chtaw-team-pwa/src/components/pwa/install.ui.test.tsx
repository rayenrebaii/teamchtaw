import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Providers } from "@/components/providers";
import { InstallPWAButton } from "./InstallPWAButton";
import { useCommunity } from "@/stores/community";

vi.mock("next/navigation", () => ({ usePathname: () => "/install" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Public PWA installation", () => {
  it("renders immediately without restoring a backend session", () => {
    const restore = vi.spyOn(useCommunity.getState(), "restore");
    render(<Providers><h1>Installer Team Chtaw</h1></Providers>);
    expect(screen.getByRole("heading").textContent).toBe("Installer Team Chtaw");
    expect(restore).not.toHaveBeenCalled();
  });

  it("opens the native install prompt only in response to a user click", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 15) Chrome/140");
    render(<InstallPWAButton showStatus />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
    await act(async () => { window.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(prompt).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Installer l’application" })); });
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it("shows browser instructions when the native prompt is unavailable", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone) Safari/605");
    render(<InstallPWAButton showStatus />);
    fireEvent.click(screen.getByRole("button", { name: "Installer l’application" }));
    expect(screen.getByRole("status").textContent).toContain("Safari");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the native installer on Windows without downloading an HTML file", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0) Chrome/140");
    const download = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<InstallPWAButton showStatus />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
      prompt, userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    await act(async () => { window.dispatchEvent(event); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Installer l’application" })); });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
    expect(screen.getByText(/Créer un raccourci sur le Bureau/)).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
