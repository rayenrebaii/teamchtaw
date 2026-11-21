"use client";
import { useCallback, useId, useState } from "react";
import { CalendarDays, Mail, RotateCcw, Search, ShieldCheck, Trash2, UserRoundPlus } from "lucide-react";
import { api } from "@/services/api-client";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { LoadState, useRemote } from "./attendance-panel";
import type { User } from "@/types";
import { tablePage } from "@/lib/pagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { Avatar, Empty } from "@/components/shared";
import memberStyles from "./members-panel.module.css";
import styles from "./administrators-screen.module.css";

export function AdministratorsScreen() {
  const { t, locale, error: failure } = useCopy();
  const id = useId();
  const actorId = useCommunity((store) => store.session?.userId);
  const load = useCallback(() => api.request<User[]>("/admin/administrators"), []);
  const remote = useRemote(load);
  const [page, setPage] = useState(1);
  const defaults = { search: "", status: "ALL", kind: "ALL", order: "recent" };
  const [filters, setFilters] = useState(defaults);
  const administrators = remote.data ?? [];
  const active = (user: User) => !user.isInvitedAdmin || !!user.activatedAt;
  const counts = { ALL: administrators.length, ACTIVE: administrators.filter(active).length,
    PENDING: administrators.filter(user => !active(user)).length,
    PRINCIPAL: administrators.filter(user => !user.isInvitedAdmin).length };
  const terms = filters.search.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const results = administrators.filter(user => {
    const text = `${user.firstName} ${user.lastName} ${user.email}`.toLocaleLowerCase(locale);
    return terms.every(term => text.includes(term)) &&
      (filters.status === "ALL" || (filters.status === "ACTIVE" ? active(user) : !active(user))) &&
      (filters.kind === "ALL" || (filters.kind === "PRINCIPAL" ? !user.isInvitedAdmin : user.isInvitedAdmin));
  }).sort((a, b) => {
    const delta = new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() || a.id.localeCompare(b.id);
    return filters.order === "oldest" ? delta : -delta;
  });
  const visiblePage = tablePage(results, page);
  const tabs = [{ value: "ALL", label: "Tous les administrateurs" }, { value: "ACTIVE", label: "Actifs" }, { value: "PENDING", label: "Invitations en attente" }] as const;
  const update = (patch: Partial<typeof defaults>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(1); };
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
      <div><span className="eyebrow">{t("ESPACE ADMIN · ADMINISTRATEURS")}</span><h1 id={`${id}-heading`}>{t("Administrateurs")}</h1>
        <p className="muted">{t("Invitez un agent à aider l’administrateur principal dans la saisie et le suivi des présences.")}</p></div>
      <Button onClick={() => { setError(""); setInvite(true); }}><UserRoundPlus size={17} aria-hidden="true" />{t("Inviter un administrateur")}</Button>
    </header>
    <div className={`stats-grid members-stats ${styles.stats}`} aria-label={t("Statistiques des administrateurs")}>
      {[{ label: "Total des administrateurs", value: counts.ALL }, { label: "Administrateurs actifs", value: counts.ACTIVE },
        { label: "Administrateurs principaux", value: counts.PRINCIPAL }, { label: "Invitations en attente", value: counts.PENDING }].map(stat =>
        <div className="stat-card" key={stat.label}><span>{t(stat.label)}</span><strong>{remote.loading && !remote.data ? "…" : remote.error && !remote.data ? "—" : stat.value}</strong></div>)}
    </div>
    {message && <p role="status">{t(message)}</p>}
    {error && !invite && !target && <p className="error" role="alert">{failure(error)}</p>}
    <section className={`panel requests-panel ${memberStyles.panel}`} aria-labelledby={`${id}-heading`}>
      <div className={memberStyles.tabsShell}><div className="request-status-tabs" role="tablist" aria-label={t("Statut des administrateurs")}>
        {tabs.map((tab, index) => <button key={tab.value} type="button" role="tab" id={`${id}-${tab.value}`} aria-selected={filters.status === tab.value}
          aria-controls={`${id}-results`} tabIndex={filters.status === tab.value ? 0 : -1} disabled={busy} onClick={() => update({ status: tab.value })}
          onKeyDown={event => {
            const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
            if (next === null) return;
            event.preventDefault(); update({ status: tabs[next].value }); document.getElementById(`${id}-${tabs[next].value}`)?.focus();
          }}>{t(tab.label)}<span>{counts[tab.value]}</span></button>)}
      </div></div>
      <div className="request-primary-filters">
        <label>{t("Rechercher un administrateur")}<span className="request-search-input"><Search size={18} aria-hidden="true" />
          <input type="search" maxLength={254} value={filters.search} disabled={busy} placeholder={t("Nom, prénom ou email…")} onChange={event => update({ search: event.target.value })} />
        </span></label>
        <label>{t("Trier par date")}<select value={filters.order} disabled={busy} onChange={event => update({ order: event.target.value })}>
          <option value="recent">{t("Les plus récentes")}</option><option value="oldest">{t("Les plus anciennes")}</option>
        </select></label>
        <label>{t("Type de compte")}<select value={filters.kind} disabled={busy} onChange={event => update({ kind: event.target.value })}>
          <option value="ALL">{t("Tous les types")}</option><option value="PRINCIPAL">{t("Administrateur principal")}</option><option value="INVITED">{t("Administrateur invité")}</option>
        </select></label>
      </div>
      <div className="request-filter-actions"><Button variant="ghost" size="sm" disabled={busy} onClick={() => update(defaults)}><RotateCcw size={14} aria-hidden="true" />{t("Réinitialiser")}</Button></div>
      <div role="tabpanel" id={`${id}-results`} aria-labelledby={`${id}-${filters.status}`} tabIndex={0} aria-busy={remote.loading}>
      <LoadState {...remote} retry={remote.refresh} />
      <p className="request-results-count" role="status" aria-live="polite">{remote.loading ? t("Actualisation des administrateurs…") : t("{count} résultat(s) sur {total} compte(s)", { count: results.length, total: administrators.length })}</p>
      <div className={`table-wrap request-table ${memberStyles.table} ${styles.table}`} role="region" aria-label={t("Administrateurs")} tabIndex={0}><table>
        <caption className="sr-only">{t("Administrateurs")}</caption>
        <thead><tr>{["Membre", "Inscription", "Statut", "Actions"].map((label) => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{visiblePage.items.map((user) => <tr key={user.id} className={`${memberStyles.memberRow} ${styles.row}`}>
          <td data-label={t("Membre")} className={memberStyles.identity}><div className={memberStyles.member}>
            <Avatar user={user} /><div className={memberStyles.memberText}><strong>{user.firstName} {user.lastName}</strong><span className="table-email" title={user.email}>{user.email}</span></div>
          </div></td>
          <td data-label={t("Inscription")} className={memberStyles.date}><span className={memberStyles.infoLabel} aria-hidden="true"><CalendarDays size={14} />{t("Inscription")}</span><time dateTime={user.joinedAt}>{new Date(user.joinedAt).toLocaleDateString(locale)}</time></td>
          <td data-label={t("Statut")} className={memberStyles.status}><div className={memberStyles.statusStack}><span className={`badge ${!user.isInvitedAdmin ? styles.principal : user.activatedAt ? styles.active : styles.pending}`}>{t(!user.isInvitedAdmin ? "Administrateur principal" : user.activatedAt ? "Actif" : "Invitation en attente")}</span></div></td>
          <td data-label={t("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}><div className={`${memberStyles.actions} ${user.isInvitedAdmin ? memberStyles.approvedActions : ""} ${styles.actions}`}>
            {!user.isInvitedAdmin ? <span className={styles.protected}><ShieldCheck size={16} aria-hidden="true" /> {t("Compte protégé")}</span> : <>
              {!user.disabledAt && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(async () => {
                await api.request(`/admin/administrators/${user.id}/${user.activatedAt ? "reset-password" : "invitation"}`, { method: "POST" });
              }, "E-mail accepté par le service d’envoi.")}><Mail size={15} aria-hidden="true" />{t(user.activatedAt ? "Réinitialiser le mot de passe" : "Renvoyer l’invitation")}</Button>}
              {user.id !== actorId && <Button size="sm" variant="destructive" disabled={busy} onClick={() => { setError(""); setTarget(user); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>}
            </>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {!remote.loading && !remote.error && !results.length && <Empty title={t("Aucun administrateur ne correspond")}>{t("Modifiez la recherche, le statut ou le type de compte.")}</Empty>}
      <TablePagination page={visiblePage.page} total={results.length} onChange={setPage} disabled={busy || remote.loading} />
      </div>
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
