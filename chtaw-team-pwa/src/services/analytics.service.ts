import { api } from "./api-client";
export type AnalyticsPeriod = "week" | "month" | "quarter" | "year" | "custom";
export type AnalyticsInterval = "day" | "week" | "month";
export interface AnalyticsFilters { period: AnalyticsPeriod; groupId: string; from: string; to: string }
export interface AttendanceCounts { present: number; absent: number; pending: number; rate: number | null }
export interface RegistrationBucket { from: string; to: string; count: number; cumulative: number }
export interface GroupAnalytics extends AttendanceCounts { id: string; name: string; members: number }
export interface SessionAnalytics extends AttendanceCounts { id: string; name: string; date: string; groups: string[] }
export interface AlertAnalytics { id: string; userId: string; student: string; organizer: string; groups: string[]; absences: number }
export interface AnalyticsSummary {
  period: { from: string; to: string; timeZone: string; interval: AnalyticsInterval };
  generatedAt: string;
  kpis: AttendanceCounts & { users: number; approved: number; pendingUsers: number; groups: number; sessions: number };
  registrations: RegistrationBucket[];
  groups: GroupAnalytics[];
}
export interface AnalyticsPage<T> { items: T[]; total: number; page: number; limit: number }
export const defaultAnalyticsFilters: AnalyticsFilters = { period: "month", groupId: "", from: "", to: "" };
export function analyticsParams(filters: AnalyticsFilters) {
  const params = new URLSearchParams({ period: filters.period });
  if (filters.groupId) params.set("groupId", filters.groupId);
  if (filters.period === "custom") { params.set("from", filters.from); params.set("to", filters.to); }
  return params.toString();
}
export const analyticsService = {
  summary: (query: string, interval: AnalyticsInterval) => api.request<AnalyticsSummary>(`/admin/analytics?${query}&interval=${interval}`),
  sessions: (query: string, page: number) => api.request<AnalyticsPage<SessionAnalytics>>(`/admin/analytics/sessions?${query}&page=${page}`),
  alerts: (groupId: string, page: number) => api.request<AnalyticsPage<AlertAnalytics>>(`/admin/analytics/alerts?page=${page}${groupId ? `&groupId=${encodeURIComponent(groupId)}` : ""}`),
};
