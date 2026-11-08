"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, attempt } from "@/components/shared";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import type { User } from "@/types";
export function UserMenu({ user }: { user: User }) {
  const { t } = useCopy();
  const menu = useRef<HTMLDetailsElement>(null);
  const router = useRouter();
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !menu.current?.contains(event.target)) menu.current?.removeAttribute("open"); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const close = () => menu.current?.removeAttribute("open");
  return <details className="user-menu" ref={menu}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}
    onKeyDown={(event) => { if (event.key === "Escape") { close(); menu.current?.querySelector("summary")?.focus(); } }}>
    <summary aria-label={t("Menu utilisateur de {name}", { name: user.firstName })}><Avatar user={{ firstName: user.firstName.trim().toLocaleLowerCase(), lastName: user.lastName.trim().toLocaleLowerCase() }} /></summary>
    <nav aria-label={t("Mon profil")}>
      <Link href="/app/profile" onClick={close}><UserRound size={17} />{t("Mon profil")}</Link>
      <Link href="/app/settings" onClick={close}><Settings size={17} />{t("Paramètres")}</Link>
      <button data-confirm-navigation onClick={() => { close(); void attempt(async () => { await useCommunity.getState().logout(); router.replace("/login"); }); }}><LogOut size={17} />{t("Déconnexion")}</button>
    </nav>
  </details>;
}
