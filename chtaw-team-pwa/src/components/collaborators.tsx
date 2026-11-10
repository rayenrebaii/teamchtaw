"use client";
import { useCallback, useId, useState } from "react";
import Link from "next/link";
import { api } from "@/services/api-client";
import { attendanceService, type AbsenceAlert } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { LoadState, useRemote } from "@/components/admin/attendance-panel";
import type { User } from "@/types";
import { useCopy } from "@/lib/i18n";
import { Ban, CheckCircle2, ChevronDown, ClipboardCheck, Flag, KeyRound, Layers, Mail, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Trash2, UserRoundCog, UserRoundPlus, X } from "lucide-react";
import styles from "./collaborators.module.css";
import memberStyles from "./admin/members-panel.module.css";
import { isValidRequestPeriod, requestDay } from "@/features/requests";

type Collaborator = User & { memberships: { groupId: string }[] };
const send = <T,>(path: string, method: string, data?: object) => api.request<T>(path, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
const collaboratorStatus = (user: Collaborator) => user.disabledAt ? "DISABLED" : user.activatedAt ? "ACTIVE" : "INVITED";
const collaboratorTabs = [
  { value: "ALL", label: "Tous les collaborateurs", stat: "Total des collaborateurs" },
  { value: "INVITED", label: "Invités", stat: "Invitations en attente" },
  { value: "ACTIVE", label: "Actifs", stat: "Collaborateurs actifs" },
  { value: "DISABLED", label: "Bannis", stat: "Collaborateurs bannis" },
] as const;
const defaultFilters = { search: "", status: "ALL", groupId: "", order: "recent", start: "", end: "" };
export function CollaboratorsScreen() {
  const { t, locale, error: failure } = useCopy();
  const id = useId();
  const groups = useCommunity((store) => store.groups);
  const [filters, setFilters] = useState(defaultFilters);
  const [advanced, setAdvanced] = useState(false);
  const [period, setPeriod] = useState({ start: "", end: "" });
  const [page, setPage] = useState(1);
  const [groupsId, setGroupsId] = useState<string | null>(null);
  const load = useCallback(() => api.request<Collaborator[]>("/admin/collaborators?search=&status="), []);
  const remote = useRemote(load);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(false);
  const [target, setTarget] = useState<{ user: Collaborator; action: "ban" | "delete" } | null>(null);
  const all = [...new Map((remote.data ?? []).map((user) => [user.id, user])).values()];
  const counts = Object.fromEntries(collaboratorTabs.map((tab) => [tab.value, tab.value === "ALL" ? all.length : all.filter((user) => collaboratorStatus(user) === tab.value).length]));
  const update = (patch: Partial<typeof defaultFilters>) => { setFilters((previous) => ({ ...previous, ...patch })); setPage(1); };
  const terms = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = all.filter((user) => {
    const name = `${user.firstName} ${user.lastName} ${user.email}`.toLocaleLowerCase();
    const day = requestDay(user.joinedAt);
    return terms.every((term) => name.includes(term)) &&
      (filters.status === "ALL" || collaboratorStatus(user) === filters.status) &&
      (!filters.groupId || user.memberships.some((membership) => membership.groupId === filters.groupId)) &&
      (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end);
  }).sort((a, b) => {
    const delta = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() || a.id.localeCompare(b.id);
    return filters.order === "oldest" ? delta : -delta;
  });
  const invalidRange = !isValidRequestPeriod(period.start, period.end);
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const groupTarget = all.find((user) => user.id === groupsId);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); return false; }
    finally { setBusy(false); remote.refresh(); }
  }
  return <div className={`admin-page ${styles.page}`}>
    <header className={`page-heading requests-heading ${styles.heading}`}>
      <div><span className="eyebrow">{t("ADMINISTRATION · ÉQUIPE")}</span><h1 id={`${id}-heading`}>{t("Gestion des collaborateurs")}</h1><p>{t("Invitez les organisateurs et gérez leurs accès à la communauté.")}</p></div>
      <div className={styles.headingActions}>
        <Button variant="secondary" asChild><Link href="/admin/collaborator-reports"><Flag size={16} aria-hidden="true" />{t("Signalements")}</Link></Button>
        <Button onClick={() => { setError(""); setInvite(true); }}><UserRoundPlus size={17} aria-hidden="true" />{t("Inviter un collaborateur")}</Button>
      </div>
    </header>
    <div className="stats-grid members-stats" aria-label={t("Statistiques des collaborateurs")}>
      {collaboratorTabs.map((tab) => <div className="stat-card" key={tab.value}><span>{t(tab.stat)}</span><strong>{!remote.data ? remote.loading ? "…" : "—" : counts[tab.value]}</strong></div>)}
    </div>
    <p className="tiny muted">{t("Chaque collaborateur est compté une seule fois, quel que soit le nombre de groupes attribués.")}</p>
    {message && <p className={styles.feedback} role="status">{t(message)}</p>}{error && !invite && !target && !groupTarget && <p role="alert" className="error">{failure(error)}</p>}
    <section className={`panel requests-panel ${memberStyles.panel}`} aria-labelledby={`${id}-heading`}>
      <div className={memberStyles.tabsShell}><div className="request-status-tabs" role="tablist" aria-label={t("Statut des collaborateurs")}>
        {collaboratorTabs.map((tab, index) => <button type="button" role="tab" id={`${id}-${tab.value}`} key={tab.value} aria-selected={filters.status === tab.value} aria-controls={`${id}-results`} tabIndex={filters.status === tab.value ? 0 : -1} onClick={() => update({ status: tab.value })} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % collaboratorTabs.length : event.key === "ArrowLeft" ? (index + collaboratorTabs.length - 1) % collaboratorTabs.length : event.key === "Home" ? 0 : event.key === "End" ? collaboratorTabs.length - 1 : null;
          if (next === null) return; event.preventDefault(); update({ status: collaboratorTabs[next].value }); document.getElementById(`${id}-${collaboratorTabs[next].value}`)?.focus();
        }}>{t(tab.label)}<span>{remote.data ? counts[tab.value] : "—"}</span></button>)}
      </div></div>
      <div className="request-primary-filters">
        <label>{t("Rechercher un collaborateur")}<span className="request-search-input"><Search size={18} aria-hidden="true" /><input type="search" maxLength={254} placeholder={t("Nom ou adresse e-mail")} value={filters.search} onChange={(event) => update({ search: event.target.value })} /></span></label>
        <label>{t("Trier par date")}<select value={filters.order} onChange={(event) => update({ order: event.target.value })}><option value="recent">{t("Plus récentes")}</option><option value="oldest">{t("Plus anciennes")}</option></select></label>
        <label>{t("Groupe")}<select value={filters.groupId} onChange={(event) => update({ groupId: event.target.value })}><option value="">{t("Tous les groupes")}</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
      </div>
      <div className="request-filter-actions">
        <Button variant="ghost" size="sm" aria-expanded={advanced} aria-controls={`${id}-advanced`} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={16} aria-hidden="true" />{t("Filtres avancés")}<ChevronDown size={15} className={advanced ? "request-chevron-open" : ""} aria-hidden="true" /></Button>
        <Button variant="ghost" size="sm" onClick={() => { update(defaultFilters); setPeriod({ start: "", end: "" }); setAdvanced(false); }}><RotateCcw size={14} aria-hidden="true" />{t("Réinitialiser")}</Button>
      </div>
      <form id={`${id}-advanced`} className="request-advanced" hidden={!advanced} onSubmit={(event) => { event.preventDefault(); if (!invalidRange) update(period); }}>
        <div className="request-period-fields">
          <label>{t("Date de début")}<input type="date" value={period.start} aria-invalid={invalidRange} aria-describedby={invalidRange ? `${id}-period-error` : undefined} onChange={(event) => setPeriod((previous) => ({ ...previous, start: event.target.value }))} /></label>
          <label>{t("Date de fin")}<input type="date" value={period.end} aria-invalid={invalidRange} aria-describedby={invalidRange ? `${id}-period-error` : undefined} onChange={(event) => setPeriod((previous) => ({ ...previous, end: event.target.value }))} /></label>
          <Button type="submit" size="sm" disabled={invalidRange || (period.start === filters.start && period.end === filters.end)}>{t("Appliquer la période")}</Button>
        </div>
        {invalidRange && <p id={`${id}-period-error`} role="alert" className="error">{t("La date de fin doit être postérieure ou égale à la date de début.")}</p>}
        {(filters.start || filters.end) && <p className="tiny muted">{t("Période appliquée.")}</p>}
      </form>
      <div id={`${id}-results`} role="tabpanel" aria-labelledby={`${id}-${filters.status}`} tabIndex={0} aria-busy={remote.loading}>
    <LoadState {...remote} retry={remote.refresh} />
      <p className="request-results-count" role="status" aria-live="polite">{t("{count} résultat(s) sur {total} compte(s)", { count: results.length, total: all.length })}</p>
      <div className={`table-wrap request-table ${memberStyles.table}`} role="region" aria-label={t("Liste des collaborateurs")} tabIndex={0}><table>
        <caption className={styles.srOnly}>{t("Liste des collaborateurs")}</caption>
        <thead><tr>{["Collaborateur", "Inscription", "Statut", "Groupe", "Actions"].map((label) => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{results.slice((currentPage - 1) * 10, currentPage * 10).map((user) => <tr className={memberStyles.memberRow} key={user.id}>
        <td className={memberStyles.identity} data-label={t("Collaborateur")}><div className={memberStyles.member}><span className={styles.avatar} aria-hidden="true">{user.firstName[0]}{user.lastName[0]}</span><div className={memberStyles.memberText}>
          <div className={styles.name}><h2>{user.firstName} {user.lastName}</h2></div>
          <p className={styles.email}>{user.email}</p>
        </div></div></td>
        <td className={memberStyles.date} data-label={t("Inscription")}>{new Date(user.joinedAt).toLocaleDateString(locale)}</td>
        <td className={memberStyles.status} data-label={t("Statut")}><span className={`${styles.status} ${user.disabledAt ? styles.banned : ""}`}>{user.disabledAt ? <Ban size={12} aria-hidden="true" /> : user.activatedAt ? <CheckCircle2 size={12} aria-hidden="true" /> : <Mail size={12} aria-hidden="true" />}{t(user.disabledAt ? "Banni" : user.activatedAt ? "Actif" : "Invitation en attente")}</span></td>
        <td className={memberStyles.groups} data-label={t("Groupe")}>{groups.filter((group) => user.memberships.some((membership) => membership.groupId === group.id)).map((group) => group.name).join(", ") || t("Aucun groupe attribué")}</td>
        <td className={memberStyles.actionsCell} data-label={t("Actions")}><div className={`${memberStyles.actions} ${memberStyles.approvedActions}`}>
          <Button size="sm" disabled={busy} variant="secondary" onClick={() => { setError(""); setGroupsId(user.id); }}><Layers size={15} aria-hidden="true" />{t("Voir les groupes")}</Button>
          {!user.disabledAt && <Button size="sm" disabled={busy} variant="secondary" onClick={() => void act(() => send(`/admin/collaborators/${user.id}/${user.activatedAt ? "reset-password" : "invitation"}`, "POST"), "E-mail accepté par le service d’envoi.")}>{user.activatedAt ? <KeyRound size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}{t(user.activatedAt ? "Réinitialiser le mot de passe" : "Renvoyer l’invitation")}</Button>}
          <Button size="sm" disabled={busy} variant="secondary" onClick={() => {
            if (user.disabledAt) void act(() => send(`/admin/collaborators/${user.id}/disabled`, "PATCH", { disabled: false }), "Statut mis à jour.");
            else { setError(""); setTarget({ user, action: "ban" }); }
          }}>{user.disabledAt ? <RotateCcw size={15} aria-hidden="true" /> : <Ban size={15} aria-hidden="true" />}{t(user.disabledAt ? "Réactiver" : "Bannir")}</Button>
          <Button size="sm" disabled={busy} variant="destructive" onClick={() => { setError(""); setTarget({ user, action: "delete" }); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>
        </div></td>
      </tr>)}</tbody></table></div>
      {!remote.loading && !remote.error && !results.length && <div className={styles.empty}><UserRoundCog size={32} aria-hidden="true" /><h2>{t("Aucun collaborateur trouvé.")}</h2><p>{t("Invitez votre premier organisateur ou ajustez vos filtres.")}</p></div>}
      {pages > 1 && <div className={`row between ${styles.pagination}`}><Button size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t("Précédent")}</Button><span className="small muted">{t("Page {page} sur {pages}", { page: currentPage, pages })}</span><Button size="sm" variant="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>{t("Suivant")}</Button></div>}
      </div>
    </section>
    {groupTarget && <Modal open onClose={() => { if (!busy) setGroupsId(null); }} title={t("Groupes autorisés")}><p><strong>{groupTarget.firstName} {groupTarget.lastName}</strong></p>
      {error && <p role="alert" className="error">{failure(error)}</p>}
      <fieldset className={styles.permissions} disabled={busy}><legend className={styles.srOnly}>{t("Groupes autorisés")}</legend>{groups.map((group) => <label key={group.id}><input type="checkbox" checked={groupTarget.memberships.some((membership) => membership.groupId === group.id)} onChange={(event) => void act(() => send(`/admin/collaborators/${groupTarget.id}/groups/${group.id}`, "PUT", { granted: event.target.checked }), "Autorisation mise à jour.")} />{group.name}</label>)}{!groups.length && <p className="muted">{t("Aucun groupe disponible.")}</p>}</fieldset>
    </Modal>}
    {invite && <Modal open onClose={() => { if (!busy) setInvite(false); }} title={t("Inviter un collaborateur")}>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        void act(async () => {
          const result = await send<{ invitation: { sent: boolean; message?: string } }>("/admin/collaborators", "POST", Object.fromEntries(data));
          setInvite(false);
          if (!result.invitation.sent) throw Error("Invitation non envoyée. Le compte est conservé ; réessayez depuis sa fiche.");
        }, "Compte créé et invitation acceptée par le service d’e-mail.");
      }}>
        <p className="muted">{t("Une invitation sera envoyée pour permettre au collaborateur de choisir son mot de passe.")}</p>
        <div className={styles.formNames}><label>{t("Prénom")}<input name="firstName" required minLength={2} maxLength={60} autoComplete="given-name" /></label><label>{t("Nom")}<input name="lastName" required minLength={2} maxLength={60} autoComplete="family-name" /></label></div>
        <label>{t("E-mail")}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        {error && <p role="alert" className="error">{failure(error)}</p>}
        <div className="row wrap"><Button type="button" variant="secondary" disabled={busy} onClick={() => setInvite(false)}><X size={16} aria-hidden="true" />{t("Annuler")}</Button><Button disabled={busy} type="submit"><UserRoundPlus size={16} aria-hidden="true" />{t(busy ? "Traitement…" : "Créer et inviter")}</Button></div>
      </form>
    </Modal>}
    {target && <Modal open onClose={() => { if (!busy) setTarget(null); }} title={t(target.action === "ban" ? "Bannir ce collaborateur ?" : "Supprimer ce collaborateur ?")}>
      <div className="form-stack"><p><strong>{target.user.firstName} {target.user.lastName}</strong><br /><span className="muted">{target.user.email}</span></p>
        <p>{t(target.action === "ban" ? "Son accès sera bloqué et ses sessions seront déconnectées. Ses groupes, séances et historiques seront conservés. Vous pourrez le réactiver." : "Le compte, ses messages, ses sondages et ses séances, ainsi que les présences associées, seront supprimés définitivement. Cette action est irréversible.")}</p>
        {error && <p role="alert" className="error">{failure(error)}</p>}
        <div className="row wrap"><Button disabled={busy} variant="secondary" onClick={() => setTarget(null)}><X size={16} aria-hidden="true" />{t("Annuler")}</Button>
          <Button disabled={busy} variant="destructive" onClick={() => void (async () => {
            const saved = await act(() => target.action === "ban" ? send(`/admin/collaborators/${target.user.id}/disabled`, "PATCH", { disabled: true }) : send(`/users/${target.user.id}`, "DELETE"), target.action === "ban" ? "Collaborateur banni." : "Collaborateur supprimé.");
            if (saved) setTarget(null);
          })()}>{target.action === "ban" ? <Ban size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}{t(busy ? "Traitement…" : target.action === "ban" ? "Confirmer le bannissement" : "Supprimer définitivement")}</Button>
        </div>
      </div>
    </Modal>}
  </div>;
}

interface AlertDetail {
  alert: AbsenceAlert;
  total: number;
  sessions: { id: string; question: string; status: string; createdAt: string;
    options: { id: string; label: string; startsAt: string | null }[];
    participants: { absenceConfirmedAt: string | null; marks: { attendance: string; optionId: string }[];
      edits: { id: string; action: string; before: string; after: string; createdAt: string }[] }[];
    votes: { options: { attendance: string; optionId: string; edits: { id: string; before: string; after: string; createdAt: string }[] }[] }[] }[];
}
export function OrganizerReports() {
  const { t } = useCopy();
  const store = useCommunity();
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const load = useCallback(() => attendanceService.alerts(), []);
  const remote = useRemote(load);
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="admin-page form-stack"><h1>{t("Signalements par organisateur")}</h1><p>{t("Le seuil de trois absences est calculé séparément pour chaque organisateur. Les décisions sur les comptes étudiants appartiennent à l’administrateur.")}</p>
    <Button variant="secondary" onClick={remote.refresh}><RotateCcw size={16} aria-hidden="true" />{t("Actualiser")}</Button><LoadState {...remote} retry={remote.refresh} />
    {remote.data?.map((alert) => <article className="panel form-stack" key={alert.id}><h2>{alert.user?.firstName} {alert.user?.lastName}</h2>
      <p>{t("Organisateur :")} {alert.organizer?.firstName} {alert.organizer?.lastName}</p><p>{t("{count} séances concernées", { count: alert.pollIds?.length ?? 0 })} · {t(alert.resolvedAt ? "Résolu après correction" : alert.confirmedAt ? "Confirmé" : "À vérifier")}</p>
      <Button onClick={() => setSelected(alert.id)}><Search size={16} aria-hidden="true" />{t("Examiner les séances et corrections")}</Button></article>)}
    {!remote.loading && !remote.error && !remote.data?.length && <p>{t("Aucun signalement.")}</p>}
    {selected && <ReportDetail id={selected} admin={actor?.role === "ADMIN"} actorId={actor?.id ?? ""} close={() => { setSelected(null); remote.refresh(); }} />}
  </div>;
}
function ReportDetail({ id, admin, actorId, close }: { id: string; admin: boolean; actorId: string; close: () => void }) {
  const { t, locale, error: failure } = useCopy();
  const load = useCallback(() => api.request<AlertDetail>(`/organizer/absence-alerts/${id}`), [id]);
  const remote = useRemote(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const data = remote.data;
  async function act(path: string, method: string, body?: object) {
    setBusy(true); setError("");
    try { await send(path, method, body); remote.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); }
  }
  const statusLabel = (value: string) => t(({ OPEN: "Ouvert", CLOSED: "Clôturé", CANCELLED: "Annulée", PRESENT: "Présent", ABSENT: "Absent", NON_VERIFIE: "Non vérifié", true: "Inclus", false: "Exclu" } as Record<string, string>)[value] ?? value);
  return <Modal open onClose={close} title={t("Vérification du signalement")}><LoadState {...remote} retry={remote.refresh} />
    {error && <p role="alert">{failure(error)}</p>}{data && <div className="form-stack"><p>{t("{count} absences actuelles chez cet organisateur.", { count: data.total })}</p>
      {data.sessions.map((session) => <article className="attendance-history-card" key={session.id}><h3>{session.question}</h3><p>{statusLabel(session.status)}</p>
        {session.options.map((option) => <p key={option.id}>{option.label} · {option.startsAt && new Date(option.startsAt).toLocaleString(locale)} · {statusLabel(session.participants[0]?.marks.find((mark) => mark.optionId === option.id)?.attendance ?? session.votes[0]?.options.find((mark) => mark.optionId === option.id)?.attendance ?? "NON_VERIFIE")}</p>)}
        {[...(session.participants[0]?.edits ?? []), ...(session.votes[0]?.options.flatMap((option) => option.edits) ?? [])].map((edit) => <p key={edit.id}>{new Date(edit.createdAt).toLocaleString(locale)} · {statusLabel(edit.before)} → {statusLabel(edit.after)}</p>)}
        {data.alert.organizerId === actorId && <Button asChild variant="secondary"><Link href={`${admin ? "/admin" : "/collaborator"}/attendance/${session.id}`}><ClipboardCheck size={16} aria-hidden="true" />{t("Ouvrir le pointage")}</Link></Button>}
      </article>)}
      {!data.alert.resolvedAt && !data.alert.confirmedAt && <Button disabled={busy} onClick={() => void act(`/organizer/absence-alerts/${id}/confirm`, "PUT")}><ShieldCheck size={16} aria-hidden="true" />{t("Confirmer le signalement")}</Button>}
      {admin && <div className="row wrap"><Button disabled={busy} onClick={() => void act(`/admin/students/${data.alert.userId}/disabled`, "PATCH", { disabled: true })}><Ban size={16} aria-hidden="true" />{t("Suspendre le compte étudiant")}</Button><Button disabled={busy} variant="secondary" onClick={() => void act(`/admin/students/${data.alert.userId}/disabled`, "PATCH", { disabled: false })}><RotateCcw size={16} aria-hidden="true" />{t("Réactiver le compte étudiant")}</Button></div>}
    </div>}
  </Modal>;
}
