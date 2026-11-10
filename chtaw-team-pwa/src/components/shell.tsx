"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  MessageCircle,
  Users,
  UserRoundCog,
  Layers,
  ChartNoAxesColumn,
  CalendarDays,
} from "lucide-react";
import { useCommunity } from "@/stores/community";
import { destination } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";
import { AppHeader, MobileNavigation, NavigationItems } from "@/components/app-navigation";
import { useCopy } from "@/lib/i18n";
export function Shell({ children, admin = false, organizer = false }: { children: React.ReactNode; admin?: boolean; organizer?: boolean }) {
  const store = useCommunity();
  const content = useRef<HTMLDivElement>(null);
  const { t } = useCopy();
  const workspace = useRef<HTMLDivElement>(null);
  const user = store.users.find((u) => u.id === store.session?.userId);
  const router = useRouter();
  const path = usePathname();
  const valid = user?.status === "APPROVED" && (process.env.NEXT_PUBLIC_AUTH_PROVIDER !== "firebase" || user.emailVerified !== false) && (!admin || user.role === "ADMIN") && (!organizer || user.role === "COLLABORATOR" || user.role === "ADMIN");
  useEffect(() => {
    if (!user) router.replace("/login");
    else if (!valid) router.replace(destination(user));
  }, [user, valid, router]);
  useEffect(() => {
    if (!user) return;
    const viewport = window.visualViewport;
    const resize = () => {
      workspace.current?.style.setProperty(
        "--app-height",
        (viewport?.height ?? window.innerHeight) + "px",
      );
      workspace.current?.style.setProperty("--viewport-top", (viewport?.offsetTop ?? 0) + "px");
    };
    resize();
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
      window.removeEventListener("resize", resize);
    };
  }, [user]);
  useEffect(() => { if (content.current) { content.current.scrollTop = 0; content.current.scrollLeft = 0; } }, [path]);
  if (!valid || !user) return <div className="boot">{t("Ouverture de votre espace…")}</div>;
  const links =
    user.role === "USER"
      ? [
          { href: "/app", label: t("Conversations"), Icon: MessageCircle },
          { href: "/app/attendance", label: t("Présences"), Icon: CalendarDays },
        ]
      : user.role === "ADMIN" ? [
          { href: "/app", label: t("Conversations"), Icon: MessageCircle },
          { href: "/admin/users", label: t("Membres"), Icon: Users },
          { href: "/admin/collaborators", label: t("Collaborateurs"), Icon: UserRoundCog },
          { href: "/admin/calendar", label: t("Calendrier"), Icon: CalendarDays },
          { href: "/admin/polls", label: t("Sondages"), Icon: ChartNoAxesColumn },
          { href: "/admin/attendance", label: t("Présences"), Icon: CalendarDays },
          { href: "/admin/groups", label: t("Groupes"), Icon: Layers },
        ] : [
          { href: "/app", label: t("Conversations"), Icon: MessageCircle },
          { href: "/collaborator", label: t("Mon calendrier"), Icon: CalendarDays },
          { href: "/collaborator/polls", label: t("Mes sondages"), Icon: ChartNoAxesColumn },
          { href: "/collaborator/attendance", label: t("Présences"), Icon: CalendarDays },
          { href: "/collaborator/reports", label: t("Signalements"), Icon: Layers },
        ];
  const mobileItems = user.role === "ADMIN" ? links.slice(0, 4) : user.role === "COLLABORATOR" ? links.filter((link) => ["/collaborator", "/collaborator/polls", "/collaborator/attendance"].includes(link.href)) : links;
  const moreItems = user.role === "ADMIN" ? links.slice(4) : user.role === "COLLABORATOR" ? links.filter((link) => !mobileItems.includes(link)) : [];
  return (
    <div
      ref={workspace}
      className={`workspace ${user.role === "USER" ? "student-workspace" : "admin-workspace"}`}
    >
      <aside className="rail">
        <Link href="/app" className="brand" aria-label="Team Chtaw - Conversations">
          <BrandLogo />
        </Link>
        <div className="rail-caption">{t("VOTRE ESPACE")}</div>
        {user.role === "USER" ? <MobileNavigation items={links} path={path} label={t("VOTRE ESPACE")} /> : <nav aria-label={t("VOTRE ESPACE")}><NavigationItems items={links} path={path} /></nav>}
      </aside>
      {user.role !== "USER" && <MobileNavigation items={mobileItems} moreItems={moreItems} path={path} label={t(user.role === "COLLABORATOR" ? "Navigation collaborateur" : "Navigation administrateur")} className="admin-mobile-nav" />}
      <main className="workspace-main">
        <AppHeader user={user} />
        <div className="workspace-content" ref={content}>{children}</div>
      </main>
    </div>
  );
}
