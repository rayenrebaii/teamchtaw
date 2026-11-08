"use client";
import { useState, type CSSProperties } from "react";
import Link from "next/link";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { BrandLogo } from "./brand-logo";
import { NotificationBell } from "./notifications/notification-center";
import { UserMenu } from "./user-menu";
import { Modal } from "./ui/dialog";
import type { User } from "@/types";
export interface NavigationItem { href: string; label: string; Icon: LucideIcon }
export function isNavigationActive(path: string, href: string) {
  return path === href || (href === "/app" ? path.startsWith("/app/groups/") : path.startsWith(href + "/"));
}
export function NavigationItems({ items, path, close }: { items: NavigationItem[]; path: string; close?: () => void }) {
  return items.map(({ href, label, Icon }) => {
    const active = isNavigationActive(path, href);
    return <Link key={href} href={href} title={label} aria-current={active ? "page" : undefined} className={"nav-item" + (active ? " active" : "")} onClick={close}><Icon size={20} aria-hidden="true" /><span>{label}</span></Link>;
  });
}
export function MobileNavigation({ items, moreItems = [], path, label, className = "" }: { items: NavigationItem[]; moreItems?: NavigationItem[]; path: string; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useCopy();
  const active = moreItems.some((item) => isNavigationActive(path, item.href));
  return <>
    <nav className={"mobile-navigation " + className} aria-label={label} style={{ "--nav-count": items.length + (moreItems.length ? 1 : 0) } as CSSProperties}>
      <NavigationItems items={items} path={path} />
      {!!moreItems.length && <button className={"nav-item" + (active ? " active" : "")} aria-current={active ? "page" : undefined} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}><MoreHorizontal size={20} aria-hidden="true" /><span>{t("Plus")}</span></button>}
    </nav>
    {!!moreItems.length && <Modal open={open} onClose={() => setOpen(false)} title={t("Votre espace administrateur")}><nav className="admin-more-links" aria-label={t("Toutes les sections")}><NavigationItems items={moreItems} path={path} close={() => setOpen(false)} /></nav></Modal>}
  </>;
}
export function AppHeader({ user }: { user: User }) {
  return <header className="workspace-topbar"><div className="workspace-topbar-brand"><BrandLogo /><span>TEAM CHTAW</span></div><div className="workspace-topbar-actions"><NotificationBell /><UserMenu user={user} /></div></header>;
}
