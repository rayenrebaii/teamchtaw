import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MembersPanel } from "./requests-panel";
import { InstallPWAButton } from "@/components/pwa/InstallPWAButton";
import { UserMenu } from "@/components/user-menu";
import { useCommunity } from "@/stores/community";
import { usersService } from "@/services/users.service";
import type { User } from "@/types";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const originalBan = useCommunity.getState().ban;
const members: User[] = [
  { id: "admin", firstName: "Admin", lastName: "Team", email: "admin@test.invalid", role: "ADMIN", status: "APPROVED", joinedAt: "2026-11-01T10:00:00Z", bio: "" },
  { id: "pending", firstName: "Nadia", lastName: "Team", email: "nadia@test.invalid", role: "USER", status: "PENDING", joinedAt: "2026-11-02T10:00:00Z", bio: "" },
  { id: "approved", firstName: "Amine", lastName: "Team", email: "amine@test.invalid", role: "USER", status: "APPROVED", joinedAt: "2026-11-03T10:00:00Z", bio: "" },
  { id: "rejected", firstName: "Sami", lastName: "Team", email: "sami@test.invalid", role: "USER", status: "REJECTED", joinedAt: "2026-11-04T10:00:00Z", bio: "" },
];
beforeEach(() => {
  useCommunity.setState({ ban: originalBan });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  useCommunity.getState().clear();
  useCommunity.setState({ session: { userId: "admin", mode: "real" }, users: members, groups: [{ id: "private", name: "Entraînement", description: "", color: "#ffffff", isGeneral: false, memberIds: ["admin", "approved"] }] });
  vi.spyOn(usersService, "decisions").mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Gestion unique des membres", () => {
  it("réserve le bannissement aux membres approuvés non administrateurs et confirme avant suppression", async () => {
    let finish!: () => void;
    const ban = vi.spyOn(useCommunity.getState(), "ban").mockImplementation(() => new Promise<void>((resolve) => {
      finish = () => { useCommunity.getState().removeUser("approved"); resolve(); };
    }));
    render(<MembersPanel />);
    expect(screen.getAllByRole("button", { name: "Bannir" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Bannir" }));
    expect(ban).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Bannir et supprimer ce compte ?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(ban).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bannir" }));
    fireEvent.click(screen.getByRole("button", { name: "Bannir et supprimer" }));
    expect(ban).toHaveBeenCalledWith("approved");
    expect(screen.getByRole("button", { name: "Suppression…" }).hasAttribute("disabled")).toBe(true);
    finish();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByText("amine@test.invalid")).toBeNull();
  });
  it("conserve le membre et la confirmation si le serveur refuse la suppression", async () => {
    vi.spyOn(useCommunity.getState(), "ban").mockRejectedValue(Error("Suppression refusée"));
    render(<MembersPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Bannir" }));
    fireEvent.click(screen.getByRole("button", { name: "Bannir et supprimer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Bannir et supprimer" }).hasAttribute("disabled")).toBe(false));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(useCommunity.getState().users.some((user) => user.id === "approved")).toBe(true);
  });
  it("affiche tous les comptes et filtre sans changer de page", () => {
    render(<MembersPanel />);
    expect(screen.getByRole("heading", { name: "Gestion des membres" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Consulter" })).toHaveLength(4);
    fireEvent.click(screen.getByRole("tab", { name: /En attente/ }));
    expect(screen.getAllByRole("button", { name: "Consulter" })).toHaveLength(1);
    expect(screen.getByText("nadia@test.invalid")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Tous les membres/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "amine" } });
    expect(screen.getAllByRole("button", { name: "Consulter" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Réinitialiser" }));
    expect(screen.getAllByRole("button", { name: "Consulter" })).toHaveLength(4);
  });
  it("demande une confirmation et actualise le statut après la réponse", async () => {
    const review = vi.spyOn(useCommunity.getState(), "review").mockImplementation(async (id, status) => {
      useCommunity.setState({ users: members.map((user) => user.id === id ? { ...user, status } : user) });
    });
    render(<MembersPanel initialStatus="PENDING" />);
    fireEvent.click(screen.getByRole("button", { name: "Refuser" }));
    expect(review).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    await waitFor(() => expect(review).toHaveBeenCalledWith("pending", "REJECTED"));
    await waitFor(() => expect(screen.queryByText("nadia@test.invalid")).toBeNull());
  });
  it("conserve les informations et signale honnêtement l’historique ancien", async () => {
    render(<MembersPanel initialStatus="REJECTED" />);
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Afficher l’historique" }));
    expect(await screen.findByText(/Aucune décision historisée/)).toBeTruthy();
  });
  it("offre profil, paramètres et déconnexion pour chaque rôle et ferme au clavier", () => {
    for (const user of [members[0]!, members[2]!]) {
      const result = render(<UserMenu user={user} />);
      const details = result.container.querySelector("details")!;
      details.open = true;
      expect(screen.getByRole("link", { name: "Paramètres" }).getAttribute("href")).toBe("/app/settings");
      expect(screen.getByRole("link", { name: "Mon profil" })).toBeTruthy();
      expect(screen.getByRole("button", { name: "Déconnexion" })).toBeTruthy();
      fireEvent.keyDown(screen.getByLabelText(/Menu utilisateur de/), { key: "Escape" });
      expect(details.open).toBe(false);
      result.unmount();
    }
  });
});
it("attend l’événement appinstalled au lieu de simuler une installation acceptée", async () => {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  render(<InstallPWAButton />);
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
  fireEvent(window, event);
  fireEvent.click(screen.getByRole("button", { name: /Installer l’app/ }));
  await waitFor(() => expect(prompt).toHaveBeenCalledOnce());
  expect(screen.getByRole("button", { name: /Installer l’app/ })).toBeTruthy();
  fireEvent(window, new Event("appinstalled"));
  await waitFor(() => expect(screen.queryByRole("button", { name: /Installer l’app/ })).toBeNull());
});

