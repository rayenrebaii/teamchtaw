import { isSignedOut, markSignedOut, allowSession } from "./session-control";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  userId: string;
  sessionId: string;
}
export function errorMessage(body: unknown): string {
  if (typeof body === "string") return body;
  if (body && typeof body === "object" && "message" in body) {
    const value = body.message;
    if (Array.isArray(value)) return value.map(String).join(" · ");
    return errorMessage(value);
  }
  return "La requête a échoué.";
}
export class ApiClient {
  private token: string | null = null;
  private expiresAt = 0;
  private flight: Promise<TokenResponse> | null = null;
  private listeners = new Set<() => void>();
  private expiredListeners = new Set<() => void>();
  private generation = 0;
  constructor(
    readonly base = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "/api/v1" : "http://127.0.0.1:3002/api/v1"),
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}
  url(path: string) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("://"))
      throw Error("Chemin API invalide.");
    return this.base.replace(/\/$/, "") + path;
  }
  onToken(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  onExpired(listener: () => void) {
    this.expiredListeners.add(listener);
    return () => {
      this.expiredListeners.delete(listener);
    };
  }
  clear() {
    this.generation++;
    this.token = null;
    this.expiresAt = 0;
  }
  setSession(result: TokenResponse) {
    this.token = result.accessToken;
    this.expiresAt = Date.now() + result.expiresIn * 1000;
    for (const listener of this.listeners) listener();
  }
  async accessToken() {
    if (!this.token || Date.now() >= this.expiresAt - 30000) await this.refresh();
    return this.token!;
  }
  private async raw(path: string, init: RequestInit = {}) {
    try {
      return await this.fetcher(this.url(path), {
        ...init,
        credentials: "include",
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "Connexion au serveur impossible. Vérifiez votre réseau et réessayez.");
    }
  }
  private async checked<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const body: unknown = await response
      .json()
      .catch(() => ({ message: "Réponse du serveur illisible." }));
    if (!response.ok) throw new ApiError(response.status, errorMessage(body));
    return body as T;
  }
  refresh(): Promise<TokenResponse> {
    if (isSignedOut()) return Promise.reject(new ApiError(401, "Session fermée sur cet appareil."));
    if (this.flight) return this.flight;
    const epoch = this.generation;
    const run = async () => {
      try {
        if (isSignedOut()) throw new ApiError(401, "Session fermée sur cet appareil.");
        const response = await this.raw("/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Session-Transport": "cookie" },
          body: "{}",
        });
        const result = await this.checked<TokenResponse>(response);
        if (epoch !== this.generation) throw new ApiError(409, "La session a changé.");
        this.setSession(result);
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && epoch === this.generation) {
          this.clear();
          for (const listener of this.expiredListeners) listener();
        }
        throw error;
      }
    };
    const locked = async (): Promise<TokenResponse> =>
      typeof navigator !== "undefined" && navigator.locks
        ? await navigator.locks.request("chtaw-refresh-session", run)
        : await run();
    this.flight = locked().finally(() => {
      this.flight = null;
    });
    return this.flight;
  }
  async login<T extends TokenResponse>(email: string, password: string) {
    this.clear();
    const epoch = this.generation;
    if (isSignedOut()) await this.revokeBrowserSession();
    const result = await this.checked<T>(
      await this.raw("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Session-Transport": "cookie" },
        body: JSON.stringify({ email, password }),
      }),
    );
    if (epoch !== this.generation) throw new ApiError(409, "La session a changé.");
    allowSession();
    this.setSession(result);
    return result;
  }
  async request<T>(path: string, init: RequestInit = {}, authenticated = true): Promise<T> {
    const epoch = this.generation;
    const send = async () => {
      const headers = new Headers(init.headers);
      if (authenticated) headers.set("Authorization", `Bearer ${await this.accessToken()}`);
      if (init.body && !(init.body instanceof FormData))
        headers.set("Content-Type", "application/json");
      return this.raw(path, { ...init, headers });
    };
    let response = await send();
    if (response.status === 401 && authenticated) {
      await this.refresh();
      response = await send();
    }
    if (epoch !== this.generation) throw new ApiError(409, "La session a changé.");
    return this.checked<T>(response);
  }
  async revokeBrowserSession() {
    await this.checked<void>(await this.raw("/auth/logout-browser", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Session-Transport": "cookie" },
      body: "{}",
    }));
  }
  async logout() {
    markSignedOut();
    this.clear();
    await this.revokeBrowserSession();
  }
  async blob(path: string) {
    const headers = new Headers({ Authorization: `Bearer ${await this.accessToken()}` });
    let response = await this.raw(path, { headers });
    if (response.status === 401) {
      await this.refresh();
      headers.set("Authorization", `Bearer ${await this.accessToken()}`);
      response = await this.raw(path, { headers });
    }
    if (!response.ok) throw new ApiError(response.status, "Image inaccessible.");
    return response.blob();
  }
}
export const api = new ApiClient();
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
export async function collectPages<T>(load: (cursor?: string) => Promise<Page<T>>) {
  const result: T[] = [];
  let cursor: string | undefined;
  const seen = new Set<string>();
  do {
    const page = await load(cursor);
    result.push(...page.items);
    cursor = page.nextCursor ?? undefined;
    if (cursor && seen.has(cursor)) throw new ApiError(500, "Pagination incohérente.");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return result;
}
