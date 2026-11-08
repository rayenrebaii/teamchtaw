import { describe, it, expect, vi } from "vitest";
import { ApiClient, ApiError, collectPages } from "./api-client";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const pair = {
  accessToken: "memory-only-token",
  expiresIn: 900,
  userId: "user",
  sessionId: "session",
};
describe("Session HTTP réelle", () => {
  it.each([200, 404, 503])("rejects HTML as an unavailable API instead of accepting it: %s", async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("<!DOCTYPE html><h1>Not found</h1>", { status, headers: { "Content-Type": "text/html" } }));
    await expect(new ApiClient("https://api.test/api/v1", fetcher).login("test@example.test", "test-password"))
      .rejects.toMatchObject({ status: status === 200 ? 502 : status, message: expect.stringContaining("indisponible") });
  });
  it("transporte le cookie sans rendre le refresh token au JavaScript", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(pair));
    const client = new ApiClient("http://api.test/api/v1", fetcher);
    await client.login("user@example.test", "a-test-password");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "include", cache: "no-store" });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("X-Session-Transport")).toBe(
      "cookie",
    );
  });
  it("sérialise les refresh concurrents et ne persiste aucun token", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      await Promise.resolve();
      return json(pair);
    });
    const client = new ApiClient("http://api.test/api/v1", fetcher);
    const results = await Promise.all([client.refresh(), client.refresh(), client.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(results.every((result) => result.accessToken === pair.accessToken)).toBe(true);
  });
  it("renouvelle après un 401 puis rejoue une seule fois la requête", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ message: "Expired" }, 401))
      .mockResolvedValueOnce(json(pair))
      .mockResolvedValueOnce(json({ id: "user" }));
    const client = new ApiClient("http://api.test/api/v1", fetcher);
    client.setSession(pair);
    expect(await client.request("/auth/me")).toEqual({ id: "user" });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("préserve la session après un 403 sans tenter de refresh", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ message: { message: "Accès refusé" } }, 403));
    const client = new ApiClient("http://api.test/api/v1", fetcher);
    client.setSession(pair);
    await expect(client.request("/groups/private")).rejects.toMatchObject({
      status: 403,
      message: "Accès refusé",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("signale la fin de session quand le refresh est refusé", async () => {
    const client = new ApiClient(
      "http://api.test/api/v1",
      vi.fn<typeof fetch>().mockResolvedValue(json({ message: "Invalid" }, 401)),
    );
    const expired = vi.fn();
    client.onExpired(expired);
    await expect(client.refresh()).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledOnce();
  });
  it("ne restaure pas une réponse ancienne après un changement de session", async () => {
    let resolve!: (response: Response) => void;
    const client = new ApiClient(
      "http://api.test/api/v1",
      () =>
        new Promise((res) => {
          resolve = res;
        }),
    );
    const pending = client.refresh();
    await Promise.resolve();
    client.clear();
    resolve(json(pair));
    await expect(pending).rejects.toMatchObject({ status: 409 });
  });
  it("ne transforme pas une erreur réseau en données fictives", async () => {
    const client = new ApiClient(
      "http://api.test/api/v1",
      vi.fn<typeof fetch>().mockRejectedValue(Error("Network")),
    );
    await expect(client.request("/groups", {}, false)).rejects.toMatchObject({ status: 0 });
  });
  it("collecte les pages réelles et détecte un curseur cyclique", async () => {
    expect(
      await collectPages(async (cursor) =>
        cursor ? { items: [2], nextCursor: null } : { items: [1], nextCursor: "next" },
      ),
    ).toEqual([1, 2]);
    await expect(collectPages(async () => ({ items: [], nextCursor: "same" }))).rejects.toThrow(
      "Pagination incohérente",
    );
  });
});
