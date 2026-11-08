import { isSignedOut } from "./session-control";
import { api, ApiError, type TokenResponse } from "./api-client";
import type { User } from "@/types";
export const authService = {
  login: (email: string, password: string) =>
    api.login<TokenResponse & { user: User }>(email, password),
  register: (input: Pick<User, "email" | "firstName" | "lastName"> & { password: string }) =>
    api.request<User>("/auth/register", { method: "POST", body: JSON.stringify(input) }, false),
  me: () => api.request<User>("/auth/me"),
  logout: () => api.logout(),
  async restore() {
    if (isSignedOut()) {
      await api.revokeBrowserSession().catch(() => undefined);
      throw new ApiError(401, "Session fermée sur cet appareil.");
    }
    await api.refresh();
    return this.me();
  },
};
