import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AvailableGroups } from "./available-groups";
import { GroupJoinRequests } from "./group-join-requests";
import { groupsService, type GroupJoinRequest } from "@/services/groups.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";

const originalSync = useCommunity.getState().sync;
const actor: User = { id: "actor", role: "USER", firstName: "Nadia", lastName: "Team", email: "nadia@test.invalid", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const pending: GroupJoinRequest = { id: "request", status: "PENDING", createdAt: "2026-11-12T10:00:00Z", group: { id: "private", name: "Groupe privé" }, user: { id: "client", firstName: "Nadia", lastName: "Team", email: "nadia@test.invalid", role: "USER" } };
beforeEach(() => {
  usePreferences.setState({ language: "fr" });
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: actor.id, mode: "real" }, users: [actor], sync: vi.fn().mockResolvedValue(undefined) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ sync: originalSync }); });

it.each(["USER", "COLLABORATOR"] as const)("lets %s see names and send one request without opening group content", async (role) => {
  useCommunity.setState({ users: [{ ...actor, role }] });
  vi.spyOn(groupsService, "directory").mockResolvedValue([
    { id: "general", name: "Général", isGeneral: true, isMember: true, requestStatus: null },
    { id: "private", name: "Groupe privé", isGeneral: false, isMember: false, requestStatus: null },
    { id: "refused", name: "Groupe refusé", isGeneral: false, isMember: false, requestStatus: "REJECTED" },
  ]);
  let finish!: () => void;
  const send = vi.spyOn(groupsService, "requestJoin").mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ id: "request", status: "PENDING" }); }));
  render(<AvailableGroups />);
  const button = await screen.findByRole("button", { name: "Demander à rejoindre Groupe privé" });
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.queryByText("Général")).toBeNull();
  expect(screen.getByText("Demande refusée")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Groupe refusé/ })).toBeNull();
  fireEvent.click(button); fireEvent.click(button);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledWith("private");
  expect(button.hasAttribute("disabled")).toBe(true);
  finish();
  expect(await screen.findByText("Demande en attente")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Demander à rejoindre Groupe privé" })).toBeNull();
});

it("keeps the group available for retry if sending fails", async () => {
  vi.spyOn(groupsService, "directory").mockResolvedValue([{ id: "group", name: "G1", isGeneral: false, isMember: false, requestStatus: null }]);
  vi.spyOn(groupsService, "requestJoin").mockRejectedValue(Error("Connexion interrompue"));
  render(<AvailableGroups />);
  fireEvent.click(await screen.findByRole("button", { name: "Demander à rejoindre G1" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("button", { name: "Demander à rejoindre G1" }).hasAttribute("disabled")).toBe(false));
});

it.each(["APPROVED", "REJECTED"] as const)("allows the admin to record %s and updates memberships", async (status) => {
  useCommunity.setState({ users: [{ ...actor, role: "ADMIN" }] });
  vi.spyOn(groupsService, "joinRequests").mockResolvedValue([pending]);
  const review = vi.spyOn(groupsService, "reviewJoinRequest").mockResolvedValue({});
  render(<GroupJoinRequests />);
  fireEvent.click(screen.getByRole("button"));
  const row = within(await screen.findByRole("row", { name: "Nadia Team · Groupe privé" }));
  fireEvent.click(row.getByRole("button", { name: status === "APPROVED" ? "Accepter" : "Refuser" }));
  await waitFor(() => expect(review).toHaveBeenCalledWith("request", status));
  await waitFor(() => expect(screen.queryByRole("row", { name: /Nadia Team/ })).toBeNull());
  expect(useCommunity.getState().sync).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("status").textContent).toContain(status === "APPROVED" ? "Demande acceptée" : "Demande refusée");
});

it("preserves a failed request review and allows retry", async () => {
  useCommunity.setState({ users: [{ ...actor, role: "ADMIN" }] });
  vi.spyOn(groupsService, "joinRequests").mockResolvedValue([pending]);
  vi.spyOn(groupsService, "reviewJoinRequest").mockRejectedValue(Error("Connexion interrompue"));
  render(<GroupJoinRequests />);
  fireEvent.click(screen.getByRole("button"));
  fireEvent.click(await screen.findByRole("button", { name: "Accepter" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("row", { name: /Nadia Team/ })).toBeTruthy();
  expect(useCommunity.getState().sync).not.toHaveBeenCalled();
});

it("hides the administrative inbox from clients and collaborators and preserves approval gating", () => {
  const list = vi.spyOn(groupsService, "joinRequests");
  const directory = vi.spyOn(groupsService, "directory");
  const view = render(<GroupJoinRequests />);
  expect(list).not.toHaveBeenCalled();
  view.unmount();
  useCommunity.setState({ users: [{ ...actor, role: "COLLABORATOR" }] });
  const collaboratorView = render(<GroupJoinRequests />);
  expect(list).not.toHaveBeenCalled();
  collaboratorView.unmount();
  useCommunity.setState({ users: [{ ...actor, status: "PENDING" }] });
  render(<AvailableGroups />);
  expect(directory).not.toHaveBeenCalled();
});
