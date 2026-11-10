import type { Page } from "@playwright/test";
export async function fixture(page: Page, role: "USER" | "ADMIN" | "COLLABORATOR", theme: string, language = "fr") {
  const user = { id: "fixture-account", firstName: "Mohamed", lastName: "Rami", email: "fixture@example.invalid", role, status: "APPROVED", joinedAt: "2026-01-01T10:00:00Z", bio: "" };
  const groups = [{ id: "fixture-group", name: "Nom métier conservé", description: "", color: "#aabbcc", isGeneral: true, memberIds: [user.id] }];
  await page.addInitScript(({ theme, language }) => { if (!localStorage.getItem("chtaw-theme")) localStorage.setItem("chtaw-theme", theme); if (!localStorage.getItem("chtaw-language")) localStorage.setItem("chtaw-language", language); }, { theme, language });
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    const headers = { "Access-Control-Allow-Origin": "http://127.0.0.1:3001", "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Session-Transport", "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    let body: unknown;
    if (path === "/auth/refresh") body = { accessToken: "client-render-fixture", expiresIn: 900, userId: user.id, sessionId: "fixture-session" };
    else if (path === "/auth/me" || path === "/users/me") body = user;
    else if (path === "/groups") body = groups;
    else if (path === "/users") body = { items: [user], nextCursor: null };
    else if (path === "/organizer/participants") body = [];
    else if (path === "/polls") body = { items: [], nextCursor: null };
    else if (path === "/admin/stats") body = { totalUsers: 1, pendingUsers: 0, approvedUsers: 1, groups: 1, messages: 0, polls: 0 };
    else if (path === "/notifications") body = { items: [], unreadCount: 0, nextCursor: null };
    else if (path === "/notifications/preferences") body = { enabled: true, messagesEnabled: true, pollsEnabled: true, ...(role === "USER" ? { sessionRemindersEnabled: true } : {}) };
    else if (path === "/notifications/push-config") body = { enabled: false, publicKey: "" };
    else if (path === "/attendance/me") body = { user, stats: { completed: 0, present: 0, absent: 0, upcoming: 0 }, groups, items: [], total: 0, page: 1, limit: 20, timeZone: "Africa/Tunis", incompleteSchedules: false };
    else if (path.startsWith("/admin/attendance")) body = { items: [], total: 0, stats: { sessions: 0, students: 0, presences: 0, absences: 0, threshold: 0, unreadAlerts: 0 } };
    else if (path === "/admin/absence-alerts") body = [];
    else if (path.startsWith("/groups/")) body = { ...groups[0], members: [user] };
    else throw Error("Unmocked API request: " + path);
    await route.fulfill({ status: 200, headers, json: body });
  });
  await page.routeWebSocket("**/socket.io/**", (socket) => socket.close());
}
