import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...values: ClassValue[]) {
  return twMerge(clsx(values));
}
export function destination(user: { status: string; role: string; emailVerified?: boolean }) {
  if (process.env.NEXT_PUBLIC_AUTH_PROVIDER === "firebase" && user.emailVerified === false) return "/verify-email";
  return user.status === "PENDING"
    ? "/pending-approval"
    : user.status === "REJECTED"
      ? "/account-rejected"
      : user.role === "ADMIN"
        ? "/admin"
        : user.role === "COLLABORATOR" ? "/collaborator" : "/app";
}
