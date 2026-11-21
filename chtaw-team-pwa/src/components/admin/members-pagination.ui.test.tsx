import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MembersPanel } from "./requests-panel";
import { usersService, type MembersPage } from "@/services/users.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";

const admin: User = { id: "admin", role: "ADMIN", status: "APPROVED", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", joinedAt: "2026-01-01", bio: "" };
const member = (n: number): User => ({ ...admin, id: `member-${n}`, role: "USER", firstName: `Member${n}`, email: `member${n}@test.invalid` });
const response = (page: number): MembersPage => ({ items: Array.from({ length: 6 }, (_, i) => member((page - 1) * 6 + i)), total: 1000, page, pageSize: 6,
  counts: { ALL: 1000, PENDING: 200, APPROVED: 700, REJECTED: 100 } });
beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  usePreferences.setState({ language: "en" });
  useCommunity.setState({ users: [admin], session: { userId: admin.id, mode: "real" }, groups: [], loading: false });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); useCommunity.getState().clear(); usePreferences.setState({ language: "fr" }); });

it("loads just six profiles per click, uses server totals and retains selection across remote pages", async () => {
  let finish!: (data: MembersPage) => void;
  const load = vi.spyOn(usersService, "members").mockResolvedValueOnce(response(1)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(response(1));
  render(<MembersPanel />);
  await screen.findByText("member0@test.invalid");
  expect(load).toHaveBeenCalledExactlyOnceWith("page=1&order=recent");
  expect(screen.getAllByRole("button", { name: "View profile" })).toHaveLength(6);
  expect(screen.getByText("Page 1 of 167", { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select Member0 Team" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(load).toHaveBeenLastCalledWith("page=2&order=recent"));
  expect(screen.queryByText("member6@test.invalid")).toBeNull();
  finish(response(2));
  await screen.findByText("member6@test.invalid");
  expect(screen.queryByText("member0@test.invalid")).toBeNull();
  expect(screen.getByText("1 selected")).toBeTruthy();
  expect(load).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Previous" }));
  await screen.findByText("member0@test.invalid");
  expect(screen.getByRole("checkbox", { name: "Select Member0 Team" })).toHaveProperty("checked", true);
  expect(load).toHaveBeenCalledTimes(3);
});

it("resets to page one and sends search/status filters to the server", async () => {
  const load = vi.spyOn(usersService, "members").mockImplementation(async query => response(Number(new URLSearchParams(query).get("page"))));
  render(<MembersPanel />);
  await screen.findByText("member0@test.invalid");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByText("member6@test.invalid");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Nadia Team" } });
  await waitFor(() => expect(load).toHaveBeenLastCalledWith("page=1&order=recent&search=Nadia+Team"));
  fireEvent.click(screen.getByRole("tab", { name: /Pending/ }));
  await waitFor(() => expect(load).toHaveBeenLastCalledWith("page=1&order=recent&search=Nadia+Team&status=PENDING"));
});

it("shows a failed page request with retry instead of displaying old or partial results", async () => {
  const load = vi.spyOn(usersService, "members").mockRejectedValueOnce(Error("Offline")).mockResolvedValueOnce(response(1));
  render(<MembersPanel />);
  expect((await screen.findByRole("alert")).textContent).toContain("Offline");
  expect(screen.queryByRole("button", { name: "View profile" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByText("member0@test.invalid");
  expect(load).toHaveBeenCalledTimes(2);
});
