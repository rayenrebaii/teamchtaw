const key = "chtaw-signed-out";
let blocked = false;
const modeCookie = "chtaw-session-mode";
const browserCookie = "chtaw-browser-session";
function browserSessionExpired() {
  if (typeof document === "undefined") return false;
  const cookies = document.cookie.split(";").map((part) => part.trim());
  return cookies.includes(`${modeCookie}=session`) && !cookies.includes(`${browserCookie}=1`);
}
// These flags contain no credentials. The refresh token stays in its HttpOnly cookie.
// A session cookie shares the browser lifetime across tabs, including page reloads.
export function setRememberSession(remember: boolean) {
  if (typeof document === "undefined") return;
  const options = `Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  document.cookie = `${modeCookie}=${remember ? "persistent" : "session"}; Max-Age=31536000; ${options}`;
  document.cookie = `${browserCookie}=1; ${remember ? "Max-Age=0; " : ""}${options}`;
}
export function isSignedOut() {
  if (browserSessionExpired()) return true;
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(key) === "1" : blocked; }
  catch { return blocked; }
}
export function markSignedOut() {
  blocked = true;
  try { localStorage.setItem(key, "1"); } catch {}
}
export function allowSession() {
  blocked = false;
  try { localStorage.removeItem(key); } catch {}
}
