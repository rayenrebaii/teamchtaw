import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { EstablishmentsScreen } from "./establishments-screen";
import { establishmentsService } from "@/services/establishments.service";
import { studentSchoolsService, type SchoolSuggestion } from "@/services/student-schools.service";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";

const originalSync = useCommunity.getState().sync;
const school = { id: "school", name: "High school A" };
const pending: SchoolSuggestion = { id: "pending", name: "Proposed school", status: "PENDING", students: [{ id: "student", firstName: "Nadia", lastName: "Team", establishment: null }] };
beforeEach(() => {
  usePreferences.setState({ language: "en" });
  useCommunity.setState({ sync: vi.fn().mockResolvedValue(undefined) });
  vi.spyOn(establishmentsService, "list").mockResolvedValue([school]);
  vi.spyOn(studentSchoolsService, "suggestions").mockResolvedValue([pending, { ...pending, id: "approved", name: "Accepted school", status: "APPROVED" }]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useCommunity.setState({ sync: originalSync }); usePreferences.setState({ language: "fr" }); });

it("opens school requests from the header and filters suggestions in a separate dialog", async () => {
  render(<EstablishmentsScreen />);
  expect(await screen.findByRole("table", { name: "School list" })).toBeTruthy();
  const trigger = screen.getByRole("button", { name: "School requests" });
  await waitFor(() => expect(within(trigger).getByText("1")).toBeTruthy());
  expect(screen.queryByText("Proposed school")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(trigger);
  const dialog = within(await screen.findByRole("dialog", { name: "School suggestions" }));
  expect(await dialog.findByText("Proposed school")).toBeTruthy();
  expect(dialog.queryByText("Accepted school")).toBeNull();
  expect(dialog.getByRole("table", { name: "School suggestions" })).toBeTruthy();
  fireEvent.change(dialog.getByRole("combobox"), { target: { value: "APPROVED" } });
  expect(dialog.getByText("Accepted school")).toBeTruthy();
  expect(dialog.queryByRole("button", { name: "Approve" })).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("accepts a school suggestion and refreshes the school list and pending count", async () => {
  const review = vi.spyOn(studentSchoolsService, "review").mockImplementation(async () => {
    vi.mocked(studentSchoolsService.suggestions).mockResolvedValue([{ ...pending, status: "APPROVED" }]);
  });
  render(<EstablishmentsScreen />);
  await screen.findByText(school.name);
  fireEvent.click(screen.getByRole("button", { name: "School requests" }));
  const dialog = within(await screen.findByRole("dialog"));
  fireEvent.click(await dialog.findByRole("button", { name: "Approve" }));
  await waitFor(() => expect(review).toHaveBeenCalledExactlyOnceWith("pending", "APPROVED"));
  await dialog.findByText("No suggestions in this category.");
  await waitFor(() => expect(screen.getByText("0", { selector: ".count-badge > span[aria-hidden]" })).toBeTruthy());
  expect(establishmentsService.list).toHaveBeenCalledTimes(2);
});

it("keeps school editing available outside the requests dialog", async () => {
  const update = vi.spyOn(establishmentsService, "update").mockResolvedValue({ ...school, name: "Updated school" });
  render(<EstablishmentsScreen />);
  fireEvent.click(await screen.findByRole("button", { name: "Edit High school A" }));
  const dialog = within(screen.getByRole("dialog"));
  fireEvent.change(dialog.getByRole("textbox"), { target: { value: "Updated school" } });
  fireEvent.click(dialog.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(update).toHaveBeenCalledWith("school", "Updated school"));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});
