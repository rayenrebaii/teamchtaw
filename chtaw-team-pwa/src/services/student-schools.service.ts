import { api } from "./api-client";
import type { User } from "@/types";
import type { Establishment } from "./establishments.service";
export interface SchoolSuggestion {
  id: string; name: string; status: "PENDING" | "APPROVED" | "REJECTED";
  students: { id: string; firstName: string; lastName: string; establishment: Establishment | null }[];
}
export const studentSchoolsService = {
  official: () => api.request<Establishment[]>("/establishments", {}, false),
  suggestions: () => api.request<SchoolSuggestion[]>("/admin/establishment-suggestions"),
  review: (id: string, status: "APPROVED" | "REJECTED") => api.request(`/admin/establishment-suggestions/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
  assign: (userId: string, establishmentId: string) => api.request<User>(`/admin/students/${encodeURIComponent(userId)}/establishment`, { method: "PATCH", body: JSON.stringify({ establishmentId }) }),
};
