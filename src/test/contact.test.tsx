import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactSection } from "@/components/site/ContactForm";
import { sendContact } from "@/lib/contact";
import { SiteLanguageProvider } from "@/lib/site-language";
vi.mock("@/lib/site", () => ({ CONTACT_API_URL: "https://api.example.test/api/v1/contact" }));
const valid = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  subject: "registration",
  message: "Une question sur mon inscription.",
  website: "",
};
beforeEach(() =>
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});
function fill() {
  render(
    <SiteLanguageProvider>
      <ContactSection />
    </SiteLanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: valid.name } });
  fireEvent.change(screen.getByLabelText("Adresse e-mail"), { target: { value: valid.email } });
  fireEvent.change(screen.getByLabelText("Sujet"), { target: { value: valid.subject } });
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: valid.message } });
}
describe("Public contact form", () => {
  it("validates fields, focuses the first error and sends nothing", () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    render(<ContactSection />);
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Nom complet")).toHaveFocus();
    expect(screen.getByLabelText("Adresse e-mail")).toHaveAttribute("aria-invalid", "true");
  });
  it("waits for persistence acknowledgement and blocks duplicate clicks", async () => {
    let finish!: (value: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetcher);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    expect(screen.getByRole("button", { name: "Envoi en cours…" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("button", { name: "Envoi en cours…" }).closest("form")!);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
    finish(new Response(JSON.stringify({ received: true }), { status: 201 }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("bien été reçu"));
    expect(screen.getByLabelText("Message")).toHaveValue("");
    expect(fetcher.mock.calls[0]).toBeTruthy();
  });
  it.each([429, 500, 400])("retains text after HTTP %i and allows retry", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status })));
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Message")).toHaveValue(valid.message);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Envoyer le message" })).toBeEnabled();
  });
  it("retains text after a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Envoyer le message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Connexion impossible");
    expect(screen.getByLabelText("Message")).toHaveValue(valid.message);
  });
  it.each([{}, { received: false }, { received: "true" }])(
    "rejects a false acknowledgement %j",
    async (body) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 })),
      );
      await expect(sendContact(valid)).rejects.toThrow("n’a pas confirmé");
    },
  );
});
