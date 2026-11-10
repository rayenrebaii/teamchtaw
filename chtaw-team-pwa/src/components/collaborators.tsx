"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { api } from "@/services/api-client";
import { attendanceService, type AbsenceAlert } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { LoadState, useRemote } from "@/components/admin/attendance-panel";
import type { User } from "@/types";
import { useCopy } from "@/lib/i18n";
import { Ban, CheckCircle2, ChevronDown, ClipboardCheck, Flag, KeyRound, Layers, Mail, RotateCcw, Search, ShieldCheck, Trash2, UserRoundCog, UserRoundPlus, X } from "lucide-react";
import styles from "./collaborators.module.css";

type Collaborator = User & { memberships: { groupId: string }[] };
const send = <T,>(path: string, method: string, data?: object) => api.request<T>(path, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
export function CollaboratorsScreen() {
  const { t, error: failure } = useCopy();
  const groups = useCommunity((store) => store.groups);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(() => api.request<Collaborator[]>(`/admin/collaborators?${new URLSearchParams({ search, status })}`), [search, status]);
  const remote = useRemote(load);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [invite, setInvite] = useState(false);
  const [target, setTarget] = useState<{ user: Collaborator; action: "ban" | "delete" } | null>(null);
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); return true; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); return false; }
    finally { setBusy(false); remote.refresh(); }
  }
  return <div className={`admin-page ${styles.page}`}>
    <header className={styles.heading}>
      <div><span className="eyebrow">{t("ADMINISTRATION · ÉQUIPE")}</span><h1>{t("Gestion des collaborateurs")}</h1><p>{t("Invitez les organisateurs et gérez leurs accès à la communauté.")}</p></div>
      <div className={styles.headingActions}>
        <Button variant="secondary" asChild><Link href="/admin/collaborator-reports"><Flag size={16} aria-hidden="true" />{t("Signalements")}</Link></Button>
        <Button onClick={() => { setError(""); setInvite(true); }}><UserRoundPlus size={17} aria-hidden="true" />{t("Inviter un collaborateur")}</Button>
      </div>
    </header>
    <div className={styles.toolbar}>
      <label className={styles.search}>{t("Rechercher")}<Search size={18} aria-hidden="true" /><input type="search" placeholder={t("Nom ou adresse e-mail")} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>{t("Statut")}<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">{t("Tous")}</option><option value="INVITED">{t("Invités")}</option><option value="ACTIVE">{t("Actifs")}</option><option value="DISABLED">{t("Bannis")}</option></select></label>
      <span className={styles.count}>{t(remote.data?.length === 1 ? "{count} collaborateur" : "{count} collaborateurs", { count: remote.data?.length ?? 0 })}</span>
    </div>
    {message && <p className={styles.feedback} role="status">{t(message)}</p>}{error && !invite && !target && <p role="alert" className="error">{failure(error)}</p>}
    <LoadState {...remote} retry={remote.refresh} />
    <div className={styles.directory}>{remote.data?.map((user) => <article className={styles.person} key={user.id}>
      <div className={styles.personHeader}>
        <div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{user.firstName[0]}{user.lastName[0]}</span><div>
          <div className={styles.name}><h2>{user.firstName} {user.lastName}</h2><span className={`${styles.status} ${user.disabledAt ? styles.banned : ""}`}>{user.disabledAt ? <Ban size={12} aria-hidden="true" /> : user.activatedAt ? <CheckCircle2 size={12} aria-hidden="true" /> : <Mail size={12} aria-hidden="true" />}{t(user.disabledAt ? "Banni" : user.activatedAt ? "Actif" : "Invitation en attente")}</span></div>
          <p className={styles.email}>{user.email}</p>
        </div></div>
        <div className={styles.actions}>
          {!user.disabledAt && <Button size="sm" disabled={busy} variant="secondary" onClick={() => void act(() => send(`/admin/collaborators/${user.id}/${user.activatedAt ? "reset-password" : "invitation"}`, "POST"), "E-mail accepté par le service d’envoi.")}>{user.activatedAt ? <KeyRound size={15} aria-hidden="true" /> : <Mail size={15} aria-hidden="true" />}{t(user.activatedAt ? "Réinitialiser le mot de passe" : "Renvoyer l’invitation")}</Button>}
          <Button size="sm" disabled={busy} variant="secondary" onClick={() => {
            if (user.disabledAt) void act(() => send(`/admin/collaborators/${user.id}/disabled`, "PATCH", { disabled: false }), "Statut mis à jour.");
            else { setError(""); setTarget({ user, action: "ban" }); }
          }}>{user.disabledAt ? <RotateCcw size={15} aria-hidden="true" /> : <Ban size={15} aria-hidden="true" />}{t(user.disabledAt ? "Réactiver" : "Bannir")}</Button>
          <Button size="sm" disabled={busy} variant="destructive" onClick={() => { setError(""); setTarget({ user, action: "delete" }); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>
        </div>
      </div>
      <details className={styles.groups}><summary><Layers size={16} aria-hidden="true" />{t("Groupes autorisés")}<span>{t(user.memberships.length === 1 ? "{count} groupe autorisé" : "{count} groupes autorisés", { count: user.memberships.length })}</span><ChevronDown className={styles.chevron} size={16} aria-hidden="true" /></summary>
        <fieldset className={styles.permissions} disabled={busy}><legend className={styles.srOnly}>{t("Groupes autorisés")} — {user.firstName} {user.lastName}</legend>{groups.map((group) => <label key={group.id}><input type="checkbox" checked={user.memberships.some((membership) => membership.groupId === group.id)} onChange={(event) => void act(() => send(`/admin/collaborators/${user.id}/groups/${group.id}`, "PUT", { granted: event.target.checked }), "Autorisation mise à jour.")} />{group.name}</label>)}{!groups.length && <p className="muted">{t("Aucun groupe disponible.")}</p>}</fieldset>
      </details>
    </article>)}</div>
    {!remote.loading && !remote.error && !remote.data?.length && <div className={styles.empty}><UserRoundCog size={32} aria-hidden="true" /><h2>{t("Aucun collaborateur trouvé.")}</h2><p>{t("Invitez votre premier organisateur ou ajustez vos filtres.")}</p></div>}
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
