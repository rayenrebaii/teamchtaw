export const BRAND = "Team Chtaw";
const contact = (import.meta.env["VITE_CONTACT_EMAIL"] ?? "").trim();
export const OWNER_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : "";
export const PWA_URL: string = (import.meta.env["VITE_PWA_URL"] ?? "").trim();
