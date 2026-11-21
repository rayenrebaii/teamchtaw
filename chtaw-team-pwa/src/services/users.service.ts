import { api, collectPages, type Page } from "./api-client";
import type { User, DashboardStats } from "@/types";
import type { RequestFilters } from "@/features/requests";
export interface MembersPage {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<"ALL" | "PENDING" | "APPROVED" | "REJECTED", number>;
}
export function membersQuery(filters: RequestFilters, page: number) {
  const query = new URLSearchParams({ page: String(page), order: filters.order });
  if (filters.search.trim()) query.set("search", filters.search.trim());
  if (filters.status !== "ALL") query.set("status", filters.status);
  if (filters.groupId) query.set("groupId", filters.groupId);
  if (filters.start) query.set("from", new Date(`${filters.start}T00:00:00`).toISOString());
  if (filters.end) {
    const before = new Date(`${filters.end}T00:00:00`);
    before.setDate(before.getDate() + 1);
    query.set("before", before.toISOString());
  }
  return query.toString();
}
export interface AdmissionDecision {
  id: string;
  status: "APPROVED" | "REJECTED";
  createdAt: string;
  actor: { firstName: string; lastName: string };
}
export const usersService = {
  members: (query: string) => api.request<MembersPage>(`/users/members?${query}`),
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
