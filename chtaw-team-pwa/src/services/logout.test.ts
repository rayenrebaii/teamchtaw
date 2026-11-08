import { afterEach, describe, expect, it, vi } from "vitest";
import { useCommunity } from "@/stores/community";
import { authService } from "./auth.service";
import { ApiClient } from "./api-client";
import { allowSession, isSignedOut } from "./session-control";
afterEach(() => { allowSession(); useCommunity.getState().clear(); vi.restoreAllMocks(); });
describe("Déconnexion complète", () => {
  it.each(["normal", "offline", "server"])("nettoie immédiatement les données : %s", async (mode) => {
    let release!: () => void;
    vi.spyOn(authService, "logout").mockImplementation(() => new Promise<void>((resolve, reject) => {
      release = () => mode === "normal" ? resolve() : reject(Error(mode));
    }));
    useCommunity.setState({ session: { userId: "member", mode: "real" }, messages: [{ id: "private" } as never], users: [{ id: "member" } as never] });
    const pending = useCommunity.getState().logout();
    expect(useCommunity.getState().session).toBeNull();
    expect(useCommunity.getState().messages).toEqual([]);
    expect(useCommunity.getState().users).toEqual([]);
    expect(isSignedOut()).toBe(true);
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    release();
    await pending;
    expect(useCommunity.getState().error).toEqual(mode === "normal" ? null : expect.stringContaining("Déconnexion locale"));
    const client = new ApiClient("https://api.example.test", vi.fn());
    await expect(client.refresh()).rejects.toMatchObject({ status: 401 });
  });
  it("retente la révocation sans restaurer le cookie après fermeture locale", async () => {
    const client = new ApiClient("https://api.example.test", vi.fn<typeof fetch>().mockRejectedValue(Error("offline")));
    await expect(client.logout()).rejects.toMatchObject({ status: 0 });
    const revoke = vi.spyOn((await import("./api-client")).api, "revokeBrowserSession").mockResolvedValue();
    await expect(authService.restore()).rejects.toMatchObject({ status: 401 });
    expect(revoke).toHaveBeenCalledOnce();
  });
});
