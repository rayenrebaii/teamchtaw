import { api } from "./api-client";
export interface ContactSummary {
  id: string; name: string; subject: string; status: "NEW" | "PROCESSED"; createdAt: string;
}
export interface ContactRequest extends ContactSummary { email: string; message: string; processedAt: string | null }
const endpoint = "/admin/contact-requests";
export const contactService = {
  list: (cursor?: string) => api.request<ContactSummary[]>(endpoint + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "")),
  get: (id: string) => api.request<ContactRequest>(`${endpoint}/${encodeURIComponent(id)}`),
  update: (id: string, status: ContactSummary["status"]) => api.request<ContactRequest>(`${endpoint}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ status }) }),
};
