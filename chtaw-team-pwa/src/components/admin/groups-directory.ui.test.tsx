import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { GroupsDirectory } from "./groups-directory";
import { AdminScreen } from "./admin-screen";
import { useCommunity } from "@/stores/community";
import { usePreferences } from "@/stores/preferences";
import type { Group, User } from "@/types";

const admin: User = { id: "a", firstName: "Admin", lastName: "Preview", email: "admin@example.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-01-01T00:00:00Z", bio: "" };
const groups: Group[] = [
  { id: "general", name: "Général", description: "Toute la communauté", color: "#a78bfa", isGeneral: true, memberIds: ["a", "b"] },
  { id: "private", name: "Atelier", description: "Musique et pratique", color: "#a78bfa", isGeneral: false, memberIds: ["b", "c"] },
  { id: "empty", name: "Vide", description: "", color: "#a78bfa", isGeneral: false, memberIds: [] },
];
beforeEach(() => {
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: admin.id, mode: "real" }, users: [admin], groups, loading: false, ready: true });
  usePreferences.setState({ language: "fr" });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const show = () => render(<GroupsDirectory onCreate={vi.fn()} onEdit={vi.fn()} />);

it("counts distinct groups and assigned people, retaining totals across filters", () => {
  useCommunity.setState({ groups: [...groups, groups[1]] });
  show();
  const count = (label: string) => screen.getByText(label, { selector: ".stat-card > span" }).parentElement?.querySelector("strong")?.textContent;
  expect(count("Total des groupes")).toBe("3");
  expect(count("Groupes privés")).toBe("2");
  expect(count("Groupes système")).toBe("1");
  expect(count("Personnes affectées")).toBe("3");
  fireEvent.click(screen.getByRole("tab", { name: /^Groupes privés/ }));
  expect(screen.queryByRole("heading", { name: "Général" })).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "musique" } });
  expect(screen.getByRole("heading", { name: "Atelier" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Vide" })).toBeNull();
  expect(count("Total des groupes")).toBe("3");
});

it("sorts groups, filters membership ranges and resets the directory", () => {
  show();
  fireEvent.change(screen.getByLabelText("Trier les groupes"), { target: { value: "members-asc" } });
  expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe("Vide");
  fireEvent.change(screen.getByLabelText("Effectif"), { target: { value: "empty" } });
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Vide"]);
  fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
  fireEvent.click(screen.getByRole("button", { name: "Filtres avancés" }));
  fireEvent.change(screen.getByLabelText("Nombre minimum de membres"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Nombre maximum de membres"), { target: { value: "1" } });
  expect((screen.getByRole("button", { name: "Appliquer les filtres" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Nombre minimum de membres"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Appliquer les filtres" }));
  expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Vide"]);
});

it("keeps general groups permanent and wires the create, edit and navigation actions", () => {
  const create = vi.fn(), edit = vi.fn();
  render(<GroupsDirectory onCreate={create} onEdit={edit} />);
  const row = within(screen.getByRole("heading", { name: "Général" }).closest("tr")!);
  expect(row.queryByRole("button", { name: /Supprimer/ })).toBeNull();
  expect(row.getByRole("link", { name: "Gérer" }).getAttribute("href")).toBe("/admin/groups/general");
  expect(row.getByRole("link", { name: "Ouvrir la conversation" }).getAttribute("href")).toBe("/app/groups/general");
  fireEvent.click(row.getByRole("button", { name: "Modifier" }));
  expect(edit).toHaveBeenCalledWith(groups[0]);
  fireEvent.click(screen.getByRole("button", { name: "Créer un groupe" }));
  expect(create).toHaveBeenCalledOnce();
});

it("requires deletion confirmation and prevents duplicate submissions while pending", async () => {
  let finish!: () => void;
  const remove = vi.spyOn(useCommunity.getState(), "deleteGroup").mockImplementation((id) => new Promise<void>((resolve) => {
    finish = () => { useCommunity.setState({ groups: groups.filter((group) => group.id !== id) }); resolve(); };
  }));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le groupe Atelier" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
  expect(remove).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le groupe Atelier" }));
  fireEvent.click(screen.getByRole("button", { name: "Supprimer le groupe" }));
  expect(remove).toHaveBeenCalledWith("private");
  expect((screen.getByRole("button", { name: "Suppression…" }) as HTMLButtonElement).disabled).toBe(true);
  finish();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.queryByRole("heading", { name: "Atelier" })).toBeNull();
});

it("shows the translated attendance-history refusal and preserves the group", async () => {
  usePreferences.setState({ language: "en" });
  vi.spyOn(useCommunity.getState(), "deleteGroup").mockRejectedValue(Error("Ce groupe possède un historique de présence. Conservez-le pour préserver les absences et les corrections."));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Delete group Atelier" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete group" }));
  expect((await screen.findByRole("alert")).textContent).toContain("attendance history");
  expect(screen.getByRole("dialog", { name: "Delete this group?" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Atelier", hidden: true })).toBeTruthy();
});

it("opens the existing group editor from the administrative groups page", () => {
  render(<AdminScreen page="groups" />);
  fireEvent.click(screen.getByRole("button", { name: "Créer un groupe" }));
  expect(screen.getByRole("dialog", { name: "Créer un groupe" })).toBeTruthy();
  expect(screen.getByLabelText("Nom du groupe")).toBeTruthy();
});
