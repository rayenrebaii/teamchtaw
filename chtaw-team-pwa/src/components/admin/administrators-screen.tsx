"use client";
import { useCallback, useState } from "react";
import { Mail, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { api } from "@/services/api-client";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { LoadState, useRemote } from "./attendance-panel";
import type { User } from "@/types";
import { tablePage } from "@/lib/pagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { Avatar } from "@/components/shared";
import memberStyles from "./members-panel.module.css";
import styles from "./administrators-screen.module.css";

export function AdministratorsScreen() {
  const { t, error: failure } = useCopy();
  const actorId = useCommunity((store) => store.session?.userId);
  const load = useCallback(() => api.request<User[]>("/admin/administrators"), []);
  const remote = useRemote(load);
  const [page, setPage] = useState(1);
  const visiblePage = tablePage(remote.data ?? [], page);
  const [invite, setInvite] = useState(false);
  const [target, setTarget] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function act(action: () => Promise<void>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); remote.refresh(); }
  }
  return <div className="admin-page">
    <header className="page-heading requests-heading">
      <div><span className="eyebrow">{t("ESPACE ADMIN")}</span><h1>{t("Administrateurs")}</h1>
        <p className="muted">{t("Invitez un agent à aider l’administrateur principal dans la saisie et le suivi des présences.")}</p></div>
      <Button onClick={() => { setError(""); setInvite(true); }}><UserRoundPlus size={17} aria-hidden="true" />{t("Inviter un administrateur")}</Button>
    </header>
    {message && <p role="status">{t(message)}</p>}
    {error && !invite && !target && <p className="error" role="alert">{failure(error)}</p>}
    <section className={`panel ${memberStyles.panel}`}>
      <LoadState {...remote} retry={remote.refresh} />
      <div className={`table-wrap request-table ${memberStyles.table} ${styles.table}`} role="region" aria-label={t("Administrateurs")} tabIndex={0}><table>
        <caption className="sr-only">{t("Administrateurs")}</caption>
        <thead><tr>{["Membre", "Statut", "Actions"].map((label) => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{visiblePage.items.map((user) => <tr key={user.id} className={`${memberStyles.memberRow} ${styles.row}`}>
          <td data-label={t("Membre")} className={memberStyles.identity}><div className={memberStyles.member}>
            <Avatar user={user} /><div className={memberStyles.memberText}><strong>{user.firstName} {user.lastName}</strong><span className="table-email" title={user.email}>{user.email}</span></div>
          </div></td>
          <td data-label={t("Statut")} className={memberStyles.status}><div className={memberStyles.statusStack}><span className={`badge ${!user.isInvitedAdmin ? styles.principal : user.activatedAt ? styles.active : styles.pending}`}>{t(!user.isInvitedAdmin ? "Administrateur principal" : user.activatedAt ? "Actif" : "Invitation en attente")}</span></div></td>
          <td data-label={t("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}><div className={`${memberStyles.actions} ${styles.actions}`}>
            {!user.isInvitedAdmin ? <span className={styles.protected}><ShieldCheck size={16} aria-hidden="true" /> {t("Compte protégé")}</span> : <>
              {!user.disabledAt && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(async () => {
                await api.request(`/admin/administrators/${user.id}/${user.activatedAt ? "reset-password" : "invitation"}`, { method: "POST" });
              }, "E-mail accepté par le service d’envoi.")}><Mail size={15} aria-hidden="true" />{t(user.activatedAt ? "Réinitialiser le mot de passe" : "Renvoyer l’invitation")}</Button>}
              {user.id !== actorId && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setError(""); setTarget(user); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>}
            </>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      <TablePagination page={visiblePage.page} total={remote.data?.length ?? 0} onChange={setPage} disabled={busy || remote.loading} />
    </section>
    {invite && <Modal open title={t("Inviter un administrateur")} onClose={() => { if (!busy) setInvite(false); }}>
      <form className="form-stack" onSubmit={(event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        void act(async () => {
          const result = await api.request<{ invitation: { sent: boolean } }>("/admin/administrators", { method: "POST", body: JSON.stringify(Object.fromEntries(form)) });
          setInvite(false);
          if (!result.invitation.sent) throw Error("Invitation non envoyée. Le compte est conservé ; réessayez depuis sa fiche.");
        }, "Administrateur créé et invitation envoyée.");
      }}>
        <p>{t("L’agent dispose des accès de gestion. Ses séances, sondages et publications appartiennent à l’administrateur principal, qui reste protégé.")}</p>
        <label>{t("Prénom")}<input name="firstName" required minLength={2} maxLength={60} autoComplete="given-name" /></label>
        <label>{t("Nom")}<input name="lastName" required minLength={2} maxLength={60} autoComplete="family-name" /></label>
        <label>{t("E-mail")}<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        {error && <p role="alert" className="error">{failure(error)}</p>}
        <div className="row wrap"><Button type="button" variant="secondary" disabled={busy} onClick={() => setInvite(false)}>{t("Annuler")}</Button><Button type="submit" disabled={busy}>{t(busy ? "Traitement…" : "Créer et inviter")}</Button></div>
      </form>
    </Modal>}
    {target && <Modal open title={t("Supprimer cet administrateur ?")} onClose={() => { if (!busy) setTarget(null); }}>
      <div className="form-stack"><p><strong>{target.firstName} {target.lastName}</strong><br />{target.email}</p>
        <p>{t("Son accès sera retiré et ses sessions déconnectées. Les séances, publications et historiques de présence de l’administrateur principal seront conservés.")}</p>
        {error && <p role="alert" className="error">{failure(error)}</p>}
        <div className="row wrap"><Button variant="secondary" disabled={busy} onClick={() => setTarget(null)}>{t("Annuler")}</Button>
          <Button variant="destructive" disabled={busy} onClick={() => void act(async () => {
            await api.request(`/users/${target.id}`, { method: "DELETE" }); setTarget(null);
          }, "Accès de l’agent retiré.")}>{t(busy ? "Traitement…" : "Retirer l’accès")}</Button></div>
      </div>
    </Modal>}
  </div>;
}
