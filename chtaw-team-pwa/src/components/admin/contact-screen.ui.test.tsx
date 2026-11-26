import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ContactScreen } from "./contact-screen";
import { contactService } from "@/services/contact.service";
import { usePreferences } from "@/stores/preferences";
vi.mock("@/services/contact.service", () => ({ contactService: { list: vi.fn(), get: vi.fn(), update: vi.fn() } }));
const item = { id: "contact-1", name: "Ada", email: "ada@example.test", subject: "registration", message: "Help with my registration <script>unsafe</script>", status: "NEW" as const, createdAt: "2026-11-26T10:00:00Z", processedAt: null };
beforeEach(() => {
  vi.clearAllMocks(); usePreferences.setState({ language: "fr" });
  vi.mocked(contactService.list).mockResolvedValue([item]); vi.mocked(contactService.get).mockResolvedValue(item);
});
afterEach(cleanup);
describe("Administration contact inbox", () => {
  it("loads a summary, opens details, offers email reply and persists processed status", async () => {
    vi.mocked(contactService.update).mockResolvedValue({ ...item, status: "PROCESSED" });
    const { container } = render(<ContactScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /Ada/ }));
    expect(await screen.findByText(item.message)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("link", { name: "Répondre par e-mail" }).getAttribute("href")).toContain("mailto:ada%40example.test");
    fireEvent.click(screen.getByRole("button", { name: "Marquer comme traitée" }));
    await waitFor(() => expect(contactService.update).toHaveBeenCalledWith(item.id, "PROCESSED"));
    expect(await screen.findByRole("button", { name: "Rouvrir la demande" })).toBeTruthy();
  });
  it("shows a loading failure without inventing an empty inbox", async () => {
    vi.mocked(contactService.list).mockRejectedValue(new Error("unavailable"));
    render(<ContactScreen />);
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Aucune demande reçue.")).toBeNull();
  });
  it("translates the inbox into English", async () => {
    usePreferences.setState({ language: "en" });
    render(<ContactScreen />);
    expect(screen.getByRole("heading", { name: "Website requests" })).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /Ada/ }));
    expect(await screen.findByRole("link", { name: "Reply by email" })).toBeTruthy();
  });
});
