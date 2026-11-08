import { api, collectPages, type Page } from "./api-client";
import type { Poll } from "@/types";
export const pollsService = {
  all: () =>
    collectPages<Poll>((cursor) =>
      api.request<Page<Poll>>(
        "/polls?limit=100" + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
      ),
    ),
  get: (id: string) => api.request<Poll>(`/polls/${encodeURIComponent(id)}`),
  create: (
    groupId: string,
    input: { question: string; options: string[]; singleChoice: boolean; endsAt?: string },
  ) =>
    api.request<Poll>(`/groups/${encodeURIComponent(groupId)}/polls`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  vote: (id: string, optionIds: string[], replace = false) =>
    api.request<Poll>(`/polls/${encodeURIComponent(id)}/votes`, {
      method: replace ? "PUT" : "POST",
      body: JSON.stringify({ optionIds }),
    }),
};
