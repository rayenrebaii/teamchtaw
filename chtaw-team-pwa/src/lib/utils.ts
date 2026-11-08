import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export function destination(user: { status: string; role: string }) {
  return user.status === "PENDING"
    ? "/pending-approval"
    : user.status === "REJECTED"
      ? "/account-rejected"
      : user.role === "ADMIN"
        ? "/admin"
        : "/app";
}
