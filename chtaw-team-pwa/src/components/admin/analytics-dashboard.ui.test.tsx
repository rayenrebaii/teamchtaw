import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnalyticsDashboard } from "./analytics-dashboard";
import { analyticsService } from "@/services/analytics.service";
import { usePreferences } from "@/stores/preferences";
import { analyticsFixture, analyticsSessionsFixture, analyticsAlertsFixture } from "../../../test/fixtures/analytics";
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  vi.spyOn(analyticsService, "summary").mockResolvedValue(analyticsFixture);
  vi.spyOn(analyticsService, "sessions").mockResolvedValue(analyticsSessionsFixture);
  vi.spyOn(analyticsService, "alerts").mockResolvedValue(analyticsAlertsFixture);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("renders five scoped KPIs and links to the existing attendance and alert details", async () => {
  render(<AnalyticsDashboard />);
  await screen.findByText("148");
  const cards = within(screen.getByRole("region", { name: "Indicateurs clés" }));
  expect(cards.getAllByRole("article")).toHaveLength(5);
  expect(cards.getByText("89,4 %")).toBeTruthy();
  expect(screen.getAllByRole("link", { name: /Révision générale/ })[0]?.getAttribute("href")).toBe("/admin/attendance/session-0");
  expect(screen.getAllByRole("link", { name: "Voir le détail" })[0]?.getAttribute("href")).toBe("/admin/collaborator-reports?alert=alert-0");
  expect(analyticsService.summary).toHaveBeenCalledWith("period=month", "day");
});
it("selects a group from the histogram and keeps alerts independent of graph dates", async () => {
  render(<AnalyticsDashboard />); await screen.findByText("148");
  fireEvent.click(screen.getByRole("button", { name: /^Préparation au bac/ }));
  const id = analyticsFixture.groups[0]!.id;
  await waitFor(() => expect(analyticsService.alerts).toHaveBeenLastCalledWith(id, 1));
  expect((screen.getByLabelText("Groupe") as HTMLSelectElement).value).toBe(id);
  const alertCalls = vi.mocked(analyticsService.alerts).mock.calls.length;
  fireEvent.change(screen.getByLabelText("Période"), { target: { value: "week" } });
  await waitFor(() => expect(analyticsService.summary).toHaveBeenLastCalledWith(`period=week&groupId=${id}`, "day"));
  expect(analyticsService.alerts).toHaveBeenCalledTimes(alertCalls);
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  await waitFor(() => expect(analyticsService.summary).toHaveBeenLastCalledWith("period=month", "day"));
});
it("applies a valid custom period only on submission", async () => {
  render(<AnalyticsDashboard />); await screen.findByText("148");
  fireEvent.change(screen.getByLabelText("Période"), { target: { value: "custom" } });
  fireEvent.change(screen.getByLabelText("Date de début"), { target: { value: "2020-10-01" } });
  fireEvent.change(screen.getByLabelText("Date de fin"), { target: { value: "2020-10-31" } });
  expect(analyticsService.summary).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
  await waitFor(() => expect(analyticsService.summary).toHaveBeenLastCalledWith("period=custom&from=2020-10-01&to=2020-10-31", "day"));
});
it("changes registration grouping without reloading sessions and supports keyboard exploration", async () => {
  render(<AnalyticsDashboard />); await screen.findByText("148");
  fireEvent.change(screen.getByLabelText("Regrouper les inscriptions"), { target: { value: "week" } });
  await waitFor(() => expect(analyticsService.summary).toHaveBeenLastCalledWith("period=month", "week"));
  expect(analyticsService.sessions).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Cumulées" }));
  const graph = screen.getByRole("img", { name: /Courbe des inscriptions/ });
  fireEvent.keyDown(graph, { key: "Home" });
  expect(screen.getByText("90 comptes cumulés")).toBeTruthy();
});
it("paginates sessions and alerts independently", async () => {
  render(<AnalyticsDashboard />); await screen.findByText("148");
  const sessions = within(screen.getByRole("region", { name: "Présences par séance" }));
  fireEvent.click(sessions.getByRole("button", { name: "Suivant" }));
  await waitFor(() => expect(analyticsService.sessions).toHaveBeenLastCalledWith("period=month", 2));
  expect(analyticsService.alerts).toHaveBeenCalledTimes(1);
  const alerts = within(screen.getByRole("region", { name: "Signalements actifs" }));
  fireEvent.click(alerts.getByRole("button", { name: "Suivant" }));
  await waitFor(() => expect(analyticsService.alerts).toHaveBeenLastCalledWith("", 2));
});
it("shows explicit empty states and no rate without finalized attendance", async () => {
  vi.mocked(analyticsService.summary).mockResolvedValue({ ...analyticsFixture, groups: [], kpis: { users: 0, approved: 0, pendingUsers: 0, groups: 0, sessions: 0, present: 0, absent: 0, pending: 0, rate: null }, registrations: [] });
  vi.mocked(analyticsService.sessions).mockResolvedValue({ total: 0, items: [], page: 1, limit: 8 });
  vi.mocked(analyticsService.alerts).mockResolvedValue({ total: 0, items: [], page: 1, limit: 5 });
  render(<AnalyticsDashboard />);
  await screen.findByText("Aucune séance terminée sur cette période.");
  expect(screen.getByText("Aucun signalement actif dans ce périmètre.")).toBeTruthy();
  expect(screen.getByText("Aucun groupe dans ce périmètre.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Taux de présence global" }).parentElement?.textContent).toContain("—");
});
it("reports aggregation errors and retries instead of showing stale KPIs", async () => {
  vi.mocked(analyticsService.summary).mockRejectedValueOnce(Error("Erreur interne."));
  render(<AnalyticsDashboard />);
  expect((await screen.findByRole("alert")).textContent).toContain("Erreur interne.");
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await screen.findByText("148");
});
it("translates the analytical dashboard to English", async () => {
  usePreferences.setState({ language: "en" }); render(<AnalyticsDashboard />);
  await screen.findByText("148");
  expect(screen.getByRole("heading", { name: "Dashboard" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Attendance by session" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cumulative" })).toBeTruthy();
});
