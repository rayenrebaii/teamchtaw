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
    render(<InstallPWAButton showStatus />);
    fireEvent.click(screen.getByRole("button", { name: "Installer l’application" }));
    expect(screen.getByRole("dialog").textContent).toContain("Safari");
    expect(screen.getByRole("dialog").textContent).toContain("Android");
  });
});
