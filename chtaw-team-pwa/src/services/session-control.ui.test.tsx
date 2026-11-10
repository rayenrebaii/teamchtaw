import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { allowSession, isSignedOut, markSignedOut, setRememberSession } from "./session-control";
import { ApiClient } from "./api-client";

function clearFlags() {
  for (const name of ["chtaw-session-mode", "chtaw-browser-session"]) document.cookie = `${name}=; Max-Age=0; Path=/`;
  localStorage.clear();
  allowSession();
}
beforeEach(clearFlags);
afterEach(clearFlags);

it("preserves existing sessions that predate the preference", () => {
  expect(isSignedOut()).toBe(false);
});
it("keeps an unchecked session during navigation, but refuses refresh after the browser session ends", async () => {
  setRememberSession(false);
  expect(isSignedOut()).toBe(false);
  document.cookie = "chtaw-browser-session=; Max-Age=0; Path=/";
  expect(isSignedOut()).toBe(true);
  const fetcher = vi.fn<typeof fetch>();
  await expect(new ApiClient("http://127.0.0.1/api/v1", fetcher).refresh()).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});
it("allows a remembered session to refresh without a browser-lifetime marker", () => {
  setRememberSession(true);
  expect(document.cookie).not.toContain("chtaw-browser-session=1");
  expect(isSignedOut()).toBe(false);
  markSignedOut();
  expect(isSignedOut()).toBe(true);
});
it("does not change the persistence preference when login fails", async () => {
  setRememberSession(false);
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: "Invalid" }), { status: 401, headers: { "Content-Type": "application/json" } }));
  await expect(new ApiClient("http://127.0.0.1/api/v1", fetcher).login("local@example.invalid", "local-only-password", true)).rejects.toMatchObject({ status: 401 });
  expect(document.cookie).toContain("chtaw-session-mode=session");
});
it("replaces an expired browser session through normal login without storing credentials", async () => {
  setRememberSession(false);
  document.cookie = "chtaw-browser-session=; Max-Age=0; Path=/";
  const pair = { accessToken: "local-memory-token", expiresIn: 900, userId: "local", sessionId: "local" };
  const fetcher = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(JSON.stringify(pair), { headers: { "Content-Type": "application/json" } }));
  await new ApiClient("http://127.0.0.1/api/v1", fetcher).login("local@example.invalid", "local-only-password", true);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(isSignedOut()).toBe(false);
  expect(document.cookie).not.toContain(pair.accessToken);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});
