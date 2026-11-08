import { api, type Page } from "./api-client";
import type { Message } from "@/types";
export const messagesService = {
  history: (id: string, cursor?: string) =>
    api.request<Page<Message>>(
      `/groups/${encodeURIComponent(id)}/messages?limit=30` +
        (cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""),
    ),
  send: (groupId: string, text: string) =>
    api.request<Message>(`/groups/${encodeURIComponent(groupId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
};
