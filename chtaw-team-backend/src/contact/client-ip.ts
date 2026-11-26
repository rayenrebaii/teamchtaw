import { isIP } from "node:net";
import type { Request } from "express";
export type ContactHttpRequest = Request & { contactClientIp?: string };
export function contactClientIp(request: Pick<Request, "socket" | "headers">, trusted: string[]) {
  const normalize = (ip: string) => ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  let address = normalize(request.socket.remoteAddress ?? "");
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded !== "string") return address;
  for (const hop of forwarded.split(",").map(value => normalize(value.trim())).reverse()) {
    if (!trusted.includes(address) || !isIP(hop)) break;
    address = hop;
  }
  return address;
}
