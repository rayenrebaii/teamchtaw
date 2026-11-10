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

type Collaborator = User & { memberships: { groupId: string }[] };
const send = <T,>(path: string, method: string, data?: object) => api.request<T>(path, { method, ...(data ? { body: JSON.stringify(data) } : {}) });
export function CollaboratorsScreen() {
  const groups = useCommunity((store) => store.groups);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const load = useCallback(() => api.request<Collaborator[]>(`/admin/collaborators?${new URLSearchParams({ search, status })}`), [search, status]);
  const remote = useRemote(load);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function act(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); remote.refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); remote.refresh(); }
  }
  return <div className="admin-page form-stack">
    <header className="page-heading"><div><h1>Gestion des collaborateurs</h1><p>Invitez les organisateurs et accordez leurs groupes individuellement.</p></div><Link href="/admin/collaborator-reports">Signalements des organisateurs</Link></header>
    <form className="panel form-stack" onSubmit={(event) => {
      event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
      void act(async () => {
        const result = await send<{ invitation: { sent: boolean; message?: string } }>("/admin/collaborators", "POST", Object.fromEntries(data));
        form.reset(); if (!result.invitation.sent) throw Error(result.invitation.message);
      }, "Compte créé et invitation acceptée par le service d’e-mail.");
    }}><h2>Inviter un collaborateur</h2>
      <label>Prénom<input name="firstName" required minLength={2} maxLength={60} autoComplete="given-name" /></label>
      <label>Nom<input name="lastName" required minLength={2} maxLength={60} autoComplete="family-name" /></label>
      <label>E-mail<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
      <Button disabled={busy} type="submit">Créer et inviter</Button>
    </form>
    <div className="request-filters"><label>Rechercher<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Statut<select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Tous</option><option value="INVITED">Invités</option><option value="ACTIVE">Actifs</option><option value="DISABLED">Désactivés</option></select></label></div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="error">{error}</p>}
    <LoadState {...remote} retry={remote.refresh} />
    {remote.data?.map((user) => <article className="panel form-stack" key={user.id}>
      <h2>{user.firstName} {user.lastName}</h2><p>{user.email} · {user.disabledAt ? "Désactivé" : user.activatedAt ? "Actif" : "Invitation en attente"}</p>
      <div className="row wrap"><Button disabled={busy} variant="secondary" onClick={() => void act(() => send(`/admin/collaborators/${user.id}/disabled`, "PATCH", { disabled: !user.disabledAt }), "Statut mis à jour.")}>{user.disabledAt ? "Réactiver" : "Désactiver"}</Button>
        {!user.disabledAt && <Button disabled={busy} variant="secondary" onClick={() => void act(() => send(`/admin/collaborators/${user.id}/${user.activatedAt ? "reset-password" : "invitation"}`, "POST"), "E-mail accepté par le service d’envoi.")}>{user.activatedAt ? "Réinitialiser le mot de passe" : "Renvoyer l’invitation"}</Button>}</div>
      <fieldset disabled={busy}><legend>Groupes autorisés</legend>{groups.map((group) => <label className="row" key={group.id}><input type="checkbox" checked={user.memberships.some((membership) => membership.groupId === group.id)} onChange={(event) => void act(() => send(`/admin/collaborators/${user.id}/groups/${group.id}`, "PUT", { granted: event.target.checked }), "Autorisation mise à jour.")} />{group.name}</label>)}</fieldset>
    </article>)}
    {!remote.loading && !remote.data?.length && <p>Aucun collaborateur trouvé.</p>}
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
  const store = useCommunity();
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const load = useCallback(() => attendanceService.alerts(), []);
  const remote = useRemote(load);
  const [selected, setSelected] = useState<string | null>(null);
  return <div className="admin-page form-stack"><h1>Signalements par organisateur</h1><p>Le seuil de trois absences est calculé séparément pour chaque organisateur. Les décisions sur les comptes étudiants appartiennent à l’administrateur.</p>
    <Button variant="secondary" onClick={remote.refresh}>Actualiser</Button><LoadState {...remote} retry={remote.refresh} />
    {remote.data?.map((alert) => <article className="panel form-stack" key={alert.id}><h2>{alert.user?.firstName} {alert.user?.lastName}</h2>
      <p>Organisateur : {alert.organizer?.firstName} {alert.organizer?.lastName}</p><p>{alert.pollIds?.length ?? 0} séances concernées · {alert.resolvedAt ? "Résolu après correction" : alert.confirmedAt ? "Confirmé" : "À vérifier"}</p>
      <Button onClick={() => setSelected(alert.id)}>Examiner les séances et corrections</Button></article>)}
    {!remote.loading && !remote.error && !remote.data?.length && <p>Aucun signalement.</p>}
    {selected && <ReportDetail id={selected} admin={actor?.role === "ADMIN"} actorId={actor?.id ?? ""} close={() => { setSelected(null); remote.refresh(); }} />}
  </div>;
}
function ReportDetail({ id, admin, actorId, close }: { id: string; admin: boolean; actorId: string; close: () => void }) {
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
  return <Modal open onClose={close} title="Vérification du signalement"><LoadState {...remote} retry={remote.refresh} />
    {error && <p role="alert">{error}</p>}{data && <div className="form-stack"><p>{data.total} absences actuelles chez cet organisateur.</p>
      {data.sessions.map((session) => <article className="attendance-history-card" key={session.id}><h3>{session.question}</h3><p>{session.status}</p>
        {session.options.map((option) => <p key={option.id}>{option.label} · {option.startsAt && new Date(option.startsAt).toLocaleString("fr-FR")} · {session.participants[0]?.marks.find((mark) => mark.optionId === option.id)?.attendance ?? session.votes[0]?.options.find((mark) => mark.optionId === option.id)?.attendance ?? "NON_VERIFIE"}</p>)}
        {[...(session.participants[0]?.edits ?? []), ...(session.votes[0]?.options.flatMap((option) => option.edits) ?? [])].map((edit) => <p key={edit.id}>{new Date(edit.createdAt).toLocaleString("fr-FR")} · {edit.before} → {edit.after}</p>)}
        {data.alert.organizerId === actorId && <Link href={`${admin ? "/admin" : "/collaborator"}/attendance/${session.id}`}>Ouvrir le pointage</Link>}
      </article>)}
      {!data.alert.resolvedAt && !data.alert.confirmedAt && <Button disabled={busy} onClick={() => void act(`/organizer/absence-alerts/${id}/confirm`, "PUT")}>Confirmer le signalement</Button>}
      {admin && <div className="row wrap"><Button disabled={busy} onClick={() => void act(`/admin/students/${data.alert.userId}/disabled`, "PATCH", { disabled: true })}>Suspendre le compte étudiant</Button><Button disabled={busy} variant="secondary" onClick={() => void act(`/admin/students/${data.alert.userId}/disabled`, "PATCH", { disabled: false })}>Réactiver le compte étudiant</Button></div>}
    </div>}
  </Modal>;
}
