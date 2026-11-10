import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { GroupEditor } from "./group-editor";
import { ChatScreen } from "@/components/chat/chat-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { User } from "@/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const admin: User = { id: "admin", firstName: "Admin", lastName: "Preview", email: "admin@example.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
beforeEach(() => {
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: admin.id, mode: "real" }, users: [admin, { ...admin, id: "member", role: "USER", firstName: "Alice" }], groups: [] });
  usePreferences.setState({ language: "en" });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local-group-preview");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("uses the selected language for the chat create-group entry point", () => {
  render(<ChatScreen />);
  expect(screen.getByRole("button", { name: "Create a group" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Créer un groupe" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create a group" }));
  expect(screen.getByRole("dialog", { name: "Create a group" })).toBeTruthy();
});

it.each(["fr", "en"] as const)("localizes the file control and preserves native image selection (%s)", async (language) => {
  usePreferences.setState({ language });
  const save = vi.spyOn(useCommunity.getState(), "saveGroup");
  render(<GroupEditor close={vi.fn()} />);
  expect(screen.getByText(language === "en" ? "Choose a file" : "Choisir un fichier")).toBeTruthy();
  expect(screen.getByText(language === "en" ? "No file selected" : "Aucun fichier choisi")).toBeTruthy();
  const input = screen.getByLabelText(language === "en" ? "Group image" : "Image du groupe") as HTMLInputElement;
  expect(input.type).toBe("file");
  expect(input.accept).toContain("image/png");
  fireEvent.change(input, { target: { files: [new File(["local-image"], "team.png", { type: "image/png" })] } });
  expect(await screen.findByText("team.png")).toBeTruthy();
  expect(screen.getByRole("img", { name: language === "en" ? "Group image" : "Image du groupe" }).getAttribute("src")).toBe("blob:local-group-preview");
  expect(save).not.toHaveBeenCalled();
});

it("keeps member selection, counts and the submit button in English", () => {
  render(<GroupEditor close={vi.fn()} />);
  expect(screen.getByText("Admin, added automatically", { exact: false })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Add Alice Preview to group" }));
  expect(screen.getByRole("button", { name: "Create group with 1 member" })).toBeTruthy();
  expect(screen.getByText("2 users · 1 selected")).toBeTruthy();
});

it("updates both file labels when the application language changes", async () => {
  const { rerender } = render(<GroupEditor close={vi.fn()} />);
  expect(screen.getByText("No file selected")).toBeTruthy();
  usePreferences.setState({ language: "fr" });
  rerender(<GroupEditor close={vi.fn()} />);
  await waitFor(() => expect(screen.getByText("Aucun fichier choisi")).toBeTruthy());
  expect(screen.getByText("Choisir un fichier")).toBeTruthy();
});
