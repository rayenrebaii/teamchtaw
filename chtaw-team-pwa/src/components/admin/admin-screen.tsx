"use client";
import { useCopy } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import {
  Users,
  Clock3,
  CalendarDays,
  ShieldCheck,
  Layers,
  MessageCircle,
  ChartNoAxesColumn,
  ArrowUpRight,
} from "lucide-react";
import { useCommunity } from "@/stores/community";
import { Avatar, Empty, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import type { Group } from "@/types";
import { GroupEditor } from "@/components/groups/group-editor";
import { MembersPanel } from "./requests-panel";
import { AttendanceDashboard, SessionPollsScreen } from "./attendance-panel";
import styles from "./group-detail.module.css";
import { GroupsDirectory } from "./groups-directory";
export function AdminScreen({
  page = "dashboard",
  groupId,
  createSession = false,
}: {
  page?: "dashboard" | "users" | "approvals" | "groups" | "polls";
  groupId?: string;
  createSession?: boolean;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [memberSearch, setMemberSearch] = useState("");
  const matches = (value: string, query: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const [editing, setEditing] = useState<Group | "new" | null>(null);
  const group = store.groups.find((g) => g.id === groupId);
  const titles = {
    dashboard: "Une team qui avance.",
    users: "Les visages de la team.",
    approvals: "La team s’agrandit.",
    groups: "À chacun son collectif.",
    polls: "Sondages",
  };
  const stats = [
    { label: "Membres au total", value: store.stats?.totalUsers, Icon: Users },
    {
      label: "Comptes en attente",
      value: store.stats?.pendingUsers,
      Icon: Clock3,
    },
    {
      label: "Comptes approuvés",
      value: store.stats?.approvedUsers,
      Icon: ShieldCheck,
    },
    { label: "Groupes actifs", value: store.stats?.groups, Icon: Layers },
    { label: "Messages partagés", value: store.stats?.messages, Icon: MessageCircle },
    { label: "Sondages lancés", value: store.stats?.polls, Icon: ChartNoAxesColumn },
  ];
  return (
    <div className="admin-page">
      {page !== "approvals" && page !== "users" && !(page === "groups" && !groupId) && (
        <header className="page-heading">
          <div>
            <span className="eyebrow"> {copy("LE COLLECTIF, CÔTÉ COULISSES")} </span>
            <h1>{groupId ? (group?.name ?? copy("Groupe introuvable")) : copy(titles[page])}</h1>
            <p className="muted">
              {page === "dashboard"
                ? copy("Bonjour {name}, voici ce qui fait vibrer votre communauté.", {
                    name: store.users.find((u) => u.id === store.session?.userId)?.firstName ?? "",
                  })
                : page === "polls"
                  ? copy("Créez vos sondages et consultez les votes et les membres sans réponse.")
                  : copy("Des liens plus forts, une communauté bien accompagnée.")}
            </p>
          </div>
          {page === "polls" ? <Button variant="secondary" asChild><Link href="/admin/calendar"><CalendarDays size={16} aria-hidden="true" />{copy("Calendrier")}</Link></Button> : <span className="demo-label"> {copy("ESPACE ADMIN")} </span>}
        </header>
      )}
      {page === "dashboard" && (
        <>
          <AttendanceDashboard compact />
          <div className="stats-grid">
            {stats.map(({ label, value, Icon }) => (
              <div className="stat-card" key={label}>
                <div className="row between">
                  <span>{copy(label)}</span>
                  <Icon size={19} />
                </div>
                <strong>{value?.toString().padStart(2, "0") ?? "…"}</strong>
                <span className="tiny muted"> {copy("Dans votre communauté")} </span>
              </div>
            ))}
          </div>
          <div className="dashboard-banner">
            <div>
              <span className="eyebrow"> {copy("FAITES GRANDIR LE MOUVEMENT")} </span>
              <h2>
                {copy("Tout commence")} <br />
                {copy("par un « bienvenue ».")}{" "}
              </h2>
              <p>
                {store.stats
                  ? copy("{count} personnes attendent de rejoindre l’aventure.", {
                      count: store.stats.pendingUsers,
                    })
                  : copy("Chargement des demandes…")}
              </p>
              <Button asChild>
                <Link href="/admin/users?status=PENDING">
                  {copy("Voir les demandes")} <ArrowUpRight size={17} />
                </Link>
              </Button>
            </div>
            <span className="banner-art">↗</span>
          </div>
          <div className="row between section-heading">
            <h2> {copy("Au cœur de la communauté")} </h2>
            <Link href="/admin/groups"> {copy("Tous les groupes ↗")} </Link>
          </div>
          <div className="group-grid">
            {store.groups
              .map((g) => (
                <Link className="group-card" key={g.id} href={`/app/groups/${g.id}`}>
                  <Avatar group={g} />
                  <h3>{g.name}</h3>
                  <p>{g.description}</p>
                  <span>
                    {g.memberIds.length} {copy("membres")} <ArrowUpRight size={17} />
                  </span>
                </Link>
              ))}
          </div>
        </>
      )}
      {(page === "approvals" || page === "users") && <MembersPanel />}
      {page === "groups" && !groupId && (
        <GroupsDirectory onCreate={() => setEditing("new")} onEdit={setEditing} />
      )}
      {page === "groups" &&
        groupId &&
        (group ? (
          <>
            <div className={`panel ${styles.summary}`}>
              <div className={`row between ${styles.header}`}>
                <Avatar group={group} size="large-avatar" />
                <div className={`row ${styles.actions}`}>
                  <Button onClick={() => setEditing(group)}> {copy("Modifier")} </Button>
                  <Button variant="secondary" asChild>
                    <Link href={`/app/groups/${group.id}`}>
                      {copy("Ouvrir la conversation")} <ArrowUpRight size={16} />
                    </Link>
                  </Button>
                </div>
              </div>
              <p>{group.description}</p>
              <span className="badge">
                {group.isGeneral
                  ? copy("Groupe permanent · Tous les membres approuvés")
                  : copy("Groupe privé")}
              </span>
            </div>
            <section className="panel">
              <h2> {copy("Membres du groupe")} </h2>
              <label>
                {" "}
                {copy("Rechercher un membre")}{" "}
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                />
              </label>
              {store.users
                .filter(
                  (u) =>
                    u.status === "APPROVED" &&
                    matches(u.firstName + " " + u.lastName + " " + u.email, memberSearch),
                )
                .map((u) => (
                  <label className="membership-row" key={u.id}>
                    <div className="row">
                      <Avatar user={u} />
                      <span>
                        {u.firstName} {u.lastName}
                      </span>
                    </div>
                    <input
                      aria-label={`Affecter ${u.firstName}`}
                      type="checkbox"
                      checked={group.memberIds.includes(u.id)}
                      disabled={
                        group.isGeneral || (group.memberIds.includes(u.id) && u.role === "ADMIN")
                      }
                      onChange={(e) =>
                        attempt(
                          () => store.membership(group.id, u.id, e.target.checked),
                          copy("Membres mis à jour"),
                        )
                      }
                    />
                  </label>
                ))}
            </section>
          </>
        ) : (
          <Empty title={copy("Ce groupe n’existe plus")}>
            <Link href="/admin/groups"> {copy("Revenir aux groupes")} </Link>
          </Empty>
        ))}
      {page === "polls" && <SessionPollsScreen pollsOnly createSession={createSession} />}
      {editing && (
        <GroupEditor
          group={editing === "new" ? undefined : editing}
          close={() => setEditing(null)}
        />
      )}
    </div>
  );
}
