export const BRAND = "Team Chtaw";
export const FOOTER_CONTACT = {
  email: "Teamchtaw@gmail.com",
  phone: "+216 56 322 399",
  phoneHref: "tel:+21656322399",
};
export const SOCIAL_LINKS = [
  { name: "Instagram", href: "https://www.instagram.com/team_chtaw?cnvx=MTUzdTEwNGxrem9weg==" },
  { name: "Facebook", href: "https://www.facebook.com/share/1DiWKmqis9/" },
  { name: "TikTok", href: "https://www.tiktok.com/@youssef_chtioui28?_r=1&_t=ZS-9BjIUNlqIfE" },
  { name: "YouTube", href: "https://youtube.com/@youssef_chtioui28?si=yP2uycrcFWSvWY1R" },
] as const;
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
