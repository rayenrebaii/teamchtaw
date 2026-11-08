const key = "chtaw-signed-out";
let blocked = false;
export function isSignedOut() {
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
