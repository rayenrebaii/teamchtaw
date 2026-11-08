import { api, collectPages, type Page } from "./api-client";
import type { User, DashboardStats } from "@/types";
export interface AdmissionDecision {
  id: string;
  status: "APPROVED" | "REJECTED";
  createdAt: string;
  actor: { firstName: string; lastName: string };
}
export const usersService = {
  ban: (id: string) => api.request<void>(`/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  decisions: (id: string) => api.request<AdmissionDecision[]>(`/approvals/${encodeURIComponent(id)}/history`),
  list: (cursor?: string) =>
    api.request<Page<User>>(
      "/users?limit=100" + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
    ),
  all: () => collectPages(usersService.list),
  stats: () => api.request<DashboardStats>("/admin/stats"),
  review: (id: string, status: "APPROVED" | "REJECTED") =>
    api.request<User>(`/approvals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  profile: (input: Pick<User, "firstName" | "lastName" | "bio">) =>
    api.request<User>("/users/me", { method: "PATCH", body: JSON.stringify(input) }),
};
