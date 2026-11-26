export const BRAND = "Team Chtaw";
const contact = (import.meta.env["VITE_CONTACT_EMAIL"] ?? "").trim();
export const OWNER_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : "";
export const PWA_URL: string = (import.meta.env["VITE_PWA_URL"] ?? "").trim();

// Public endpoint only; no administration mailbox or secret in the browser.
export const CONTACT_API_URL: string = (() => {
  try {
    const url = new URL((import.meta.env["VITE_CONTACT_API_URL"] ?? "").trim());
    return url.protocol === "https:" ||
      (import.meta.env.DEV &&
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        url.protocol === "http:")
      ? url.href
      : "";
  } catch {
    return "";
  }
})();
