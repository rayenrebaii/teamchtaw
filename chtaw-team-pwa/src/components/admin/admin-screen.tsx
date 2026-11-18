"use client";
import { useCopy } from "@/lib/i18n";
import Link from "next/link";
import { useState } from "react";
import {
  CalendarDays,
  ArrowUpRight,
} from "lucide-react";
import { useCommunity } from "@/stores/community";
import { Avatar, Empty, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import type { Group } from "@/types";
import { GroupEditor } from "@/components/groups/group-editor";
import { MembersPanel } from "./requests-panel";
import { SessionPollsScreen } from "./attendance-panel";
import styles from "./group-detail.module.css";
import { GroupsDirectory } from "./groups-directory";
import { AnalyticsDashboard } from "./analytics-dashboard";
export function AdminScreen(props: Parameters<typeof AdminWorkspace>[0]) {
  return !props.page || props.page === "dashboard" ? <AnalyticsDashboard /> : <AdminWorkspace {...props} />;
}
function AdminWorkspace({
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
