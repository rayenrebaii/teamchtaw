"use client";
import { toast } from "sonner";
import type { User, Group } from "@/types";
import { PrivateImage } from "./private-image";
import { useCopy, translateNotice } from "@/lib/i18n";
import { BrandLogo } from "./brand-logo";
export async function attempt(action: () => unknown | Promise<unknown>, message?: string) {
  try {
    await action();
    if (message) toast.success(translateNotice(message, true));
    return true;
  } catch (e) {
    toast.error(translateNotice(e instanceof Error ? e.message : "Une erreur est survenue."));
    return false;
  }
}
export function Avatar({
  user,
  group,
  size = "",
}: {
  user?: Pick<User, "firstName" | "lastName">;
  group?: Group;
  size?: string;
}) {
  return (
    <span
      className={`avatar ${size}`}
      style={group ? { background: group.color, color: "#42235c" } : undefined}
    >
      {group?.image ? (
        <PrivateImage src={group.image} alt="" />
      ) : group ? (
        group.isGeneral ? (
          <BrandLogo />
        ) : (
          group.name.slice(0, 2).toUpperCase()
        )
      ) : (
        `${user?.firstName[0] ?? "?"}${user?.lastName[0] ?? ""}`
      )}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  const { text } = useCopy();
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {text((
        { APPROVED: "Approuvé", PENDING: "En attente", REJECTED: "Refusé" } as Record<
          string,
          string
        >
      )[status] ?? status)}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  const { t } = useCopy();
  return (
    <div className="empty">
      <span className="eyebrow">{t("UN NOUVEAU DÉPART")}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
