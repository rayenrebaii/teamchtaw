import React from "react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { AdminScreen } from "@/components/admin/admin-screen";
import { GroupJoinRequests } from "./group-join-requests";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import { groupsService, type GroupJoinRequest } from "@/services/groups.service";
import type { User } from "@/types";
const admin: User = { id: "admin", role: "ADMIN", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const originalSync = useCommunity.getState().sync;
const requests: GroupJoinRequest[] = Array.from({ length: 12 }, (_, i) => ({ id: `request-${i}`, status: "PENDING", createdAt: "2026-11-12T10:00:00Z",
  group: { id: `group-${i}`, name: `G${i}` }, user: { id: `user-${i}`, firstName: `Person${i}`, lastName: "Team", email: `person${i}@test.invalid`, role: i % 2 ? "COLLABORATOR" : "USER" } }));
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ users: [admin], session: { userId: admin.id, mode: "real" }, sync: vi.fn().mockResolvedValue(undefined) });
  vi.spyOn(groupsService, "joinRequests").mockResolvedValue(requests);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ sync: originalSync }); });
const open = async () => {
  render(<GroupJoinRequests />);
  fireEvent.click(screen.getByRole("button", { name: "Demandes d’adhésion" }));
  const dialog = within(screen.getByRole("dialog", { name: "Demandes d’adhésion aux groupes" }));
  await dialog.findByRole("row", { name: "Person0 Team · G0" });
  return dialog;
};

it("opens requests from the groups header and does not render the inbox below the directory", async () => {
  const { container } = render(<AdminScreen page="groups" />);
  expect(container.querySelector(".page-heading")?.textContent).toContain("Demandes d’adhésion");
  expect(screen.queryByRole("region", { name: "Demandes d’adhésion aux groupes" })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: "Demandes d’adhésion" }).textContent).toContain("12"));
  fireEvent.click(screen.getByRole("button", { name: "Demandes d’adhésion" }));
  expect(await screen.findByRole("dialog", { name: "Demandes d’adhésion aux groupes" })).toBeTruthy();
});

it("paginates ten requests and combines name, email and role filters", async () => {
  const dialog = await open();
  expect(dialog.getAllByRole("row")).toHaveLength(11);
  fireEvent.click(dialog.getByRole("button", { name: "Suivant" }));
  expect(dialog.getByText("Page 2 sur 2")).toBeTruthy();
  expect(dialog.getAllByRole("row")).toHaveLength(3);
  fireEvent.change(dialog.getByLabelText("Nom ou prénom"), { target: { value: "Person1" } });
  expect(dialog.getByText("Page 1 sur 1")).toBeTruthy();
  expect(dialog.getAllByRole("row")).toHaveLength(4);
  fireEvent.change(dialog.getByLabelText("Rôle"), { target: { value: "COLLABORATOR" } });
  expect(dialog.getAllByRole("row")).toHaveLength(3);
  fireEvent.change(dialog.getByLabelText("E-mail"), { target: { value: "person11@" } });
  expect(dialog.getByRole("row", { name: "Person11 Team · G11" })).toBeTruthy();
  expect(dialog.getAllByRole("row")).toHaveLength(2);
});

it.each(["APPROVED", "REJECTED"] as const)("processes only selected requests across pages (%s) without duplicate submission", async (status) => {
  const review = vi.spyOn(groupsService, "reviewJoinRequest").mockResolvedValue({});
  const dialog = await open();
  fireEvent.click(dialog.getByRole("checkbox", { name: "Sélectionner la demande de Person0 Team pour G0" }));
  fireEvent.click(dialog.getByRole("button", { name: "Suivant" }));
  fireEvent.click(dialog.getByRole("checkbox", { name: "Sélectionner la demande de Person11 Team pour G11" }));
  expect(dialog.getByText("2 sélectionné(s)")).toBeTruthy();
  const button = dialog.getByRole("button", { name: status === "APPROVED" ? "Accepter la sélection" : "Refuser la sélection" });
  fireEvent.click(button); fireEvent.click(button);
  await waitFor(() => expect(review).toHaveBeenCalledTimes(2));
  expect(review).toHaveBeenCalledWith("request-0", status);
  expect(review).toHaveBeenCalledWith("request-11", status);
  await waitFor(() => expect(dialog.getByText("0 sélectionné(s)")).toBeTruthy());
  expect(document.querySelector("button[aria-describedby] .count-badge")?.textContent).toContain("10");
});

it("retains failed requests and their selection while removing successful requests", async () => {
  vi.spyOn(groupsService, "reviewJoinRequest").mockImplementation((id) => id === "request-1" ? Promise.reject(Error("Décision refusée")) : Promise.resolve({}));
  const dialog = await open();
  for (const [person, group] of [["Person0", "G0"], ["Person1", "G1"]]) fireEvent.click(dialog.getByRole("checkbox", { name: `Sélectionner la demande de ${person} Team pour ${group}` }));
  fireEvent.click(dialog.getByRole("button", { name: "Accepter la sélection" }));
  expect(await dialog.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Décision refusée"));
  expect(dialog.queryByRole("row", { name: "Person0 Team · G0" })).toBeNull();
  expect(dialog.getByRole("checkbox", { name: "Sélectionner la demande de Person1 Team pour G1" })).toHaveProperty("checked", true);
  expect(dialog.getByText("1 sélectionné(s)")).toBeTruthy();
  expect(document.querySelector("button[aria-describedby] .count-badge")?.textContent).toContain("11");
});

it("selects only the visible page and clears selection on filter changes", async () => {
  const dialog = await open();
  fireEvent.click(dialog.getByRole("checkbox", { name: "Sélectionner les demandes de cette page" }));
  expect(dialog.getByText("10 sélectionné(s)")).toBeTruthy();
  fireEvent.change(dialog.getByLabelText("Rôle"), { target: { value: "USER" } });
  expect(dialog.getByText("0 sélectionné(s)")).toBeTruthy();
});

it("refreshes the header count on focus, keeps the confirmed count on failure, and displays zero", async () => {
  const list = vi.mocked(groupsService.joinRequests);
  render(<GroupJoinRequests />);
  const button = screen.getByRole("button", { name: "Demandes d’adhésion" });
  const badge = () => button.querySelector(".count-badge")?.textContent;
  await waitFor(() => expect(badge()).toContain("12"));
  list.mockResolvedValueOnce(requests.slice(0, 3));
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(badge()).toContain("3"));
  list.mockRejectedValueOnce(Error("Offline"));
  fireEvent(window, new Event("focus"));
  await act(async () => { await Promise.resolve(); });
  expect(badge()).toContain("3");
  list.mockResolvedValueOnce([]);
  fireEvent(window, new Event("focus"));
  await waitFor(() => expect(badge()).toContain("0"));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("discards the previous admin's count response after switching accounts", async () => {
  let finish!: (value: GroupJoinRequest[]) => void;
  vi.mocked(groupsService.joinRequests).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]);
  render(<GroupJoinRequests />);
  const nextAdmin = { ...admin, id: "other-admin" };
  act(() => useCommunity.setState({ session: { userId: nextAdmin.id, mode: "real" }, users: [nextAdmin] }));
  const button = screen.getByRole("button", { name: "Demandes d’adhésion" });
  await waitFor(() => expect(button.querySelector(".count-badge")?.textContent).toContain("0"));
  await act(async () => finish(requests));
  expect(button.querySelector(".count-badge")?.textContent).not.toContain("12");
});
