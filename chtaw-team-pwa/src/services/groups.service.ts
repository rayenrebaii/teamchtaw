import { api } from "./api-client";
import type { Group, MemberSummary } from "@/types";
export const groupsService = {
  list: () => api.request<Group[]>("/groups"),
  get: (id: string) =>
    api.request<Group & { members: MemberSummary[] }>(`/groups/${encodeURIComponent(id)}`),
  create: (input: Pick<Group, "name" | "description" | "color">) =>
    api.request<Group>("/groups", { method: "POST", body: JSON.stringify(input) }),
  update: (
    id: string,
    input: Partial<Pick<Group, "name" | "description" | "color">> & {
      imageMediaId?: string | null;
    },
  ) =>
    api.request<Group>(`/groups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  remove: (id: string) =>
    api.request<void>(`/groups/${encodeURIComponent(id)}`, { method: "DELETE" }),
  member: (id: string, userId: string, add: boolean) =>
    api.request<Group>(`/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(userId)}`, {
      method: add ? "PUT" : "DELETE",
    }),
  move: (userId: string, fromGroupId: string, toGroupId: string) =>
    api.request(`/groups/members/${encodeURIComponent(userId)}/move`, {
      method: "POST",
      body: JSON.stringify({ fromGroupId, toGroupId }),
    }),
};
