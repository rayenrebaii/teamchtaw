// Deterministic UI-only fixtures. The delivered dashboard always calls the protected API.
import type { AnalyticsSummary, AnalyticsPage, AlertAnalytics, SessionAnalytics } from "../../src/services/analytics.service";
export const analyticsFixture: AnalyticsSummary = {
  generatedAt: "2026-11-18T12:00:00Z", period: { from: "2026-11-01", to: "2026-11-30", timeZone: "Africa/Tunis", interval: "day" },
  kpis: { users: 148, approved: 132, pendingUsers: 16, groups: 3, sessions: 24, present: 286, absent: 34, pending: 9, rate: 89.4 },
  registrations: Array.from({ length: 30 }, (_, i) => ({ from: `2026-11-${String(i + 1).padStart(2, "0")}`, to: `2026-11-${String(i + 1).padStart(2, "0")}`, count: i > 17 ? 0 : [2, 4, 1, 6, 3, 5][i % 6]!, cumulative: 90 + Math.min(i, 17) * 3 })),
  groups: [
    { id: "b7e182d0-0000-4000-8000-000000000001", name: "Préparation au bac", present: 132, absent: 14, pending: 4, members: 58, rate: 90.4 },
    { id: "b7e182d0-0000-4000-8000-000000000002", name: "Sciences expérimentales", present: 98, absent: 12, pending: 3, members: 46, rate: 89.1 },
    { id: "b7e182d0-0000-4000-8000-000000000003", name: "Mathématiques", present: 72, absent: 8, pending: 2, members: 34, rate: 90 },
  ],
};
export const analyticsSessionsFixture: AnalyticsPage<SessionAnalytics> = { total: 10, page: 1, limit: 6, items: Array.from({ length: 6 }, (_, i) => ({ id: `session-${i}`, name: ["Révision générale", "Entraînement collectif", "Préparation des épreuves", "Atelier de méthode"][i % 4]!, date: `2026-11-${String(17 - i).padStart(2, "0")}`, groups: ["Préparation au bac"], present: 16 + i, absent: 2, pending: i % 3, rate: 90 })) };
export const analyticsAlertsFixture: AnalyticsPage<AlertAnalytics> = { total: 7, page: 1, limit: 6, items: ["Amine Ben Ali", "Inès Trabelsi", "Youssef Mansour", "Mariem Jaziri", "Aziz Ben Amor", "Nour Hedi"].map((student, i) => ({ id: `alert-${i}`, userId: `student-${i}`, student, organizer: "Administration Chtaw", groups: ["Préparation au bac"], absences: 3 + i % 2 })) };
