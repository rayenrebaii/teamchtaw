import { api } from "./api-client";

export interface Establishment { id: string; name: string }
const endpoint = "/admin/establishments";
export const establishmentsService = {
  list: () => api.request<Establishment[]>(endpoint),
  create: (name: string) => api.request<Establishment>(endpoint, { method: "POST", body: JSON.stringify({ name }) }),
  update: (id: string, name: string) => api.request<Establishment>(`${endpoint}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ name }) }),
  remove: (id: string) => api.request<void>(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
