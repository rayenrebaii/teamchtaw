"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Inbox, Search } from "lucide-react";
import { groupsService, type GroupJoinRequest } from "@/services/groups.service";
import { useCommunity } from "@/stores/community";
import { runSelectedActions } from "@/features/bulk-actions";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import styles from "./join-requests.module.css";
import bulkStyles from "@/components/admin/bulk-actions.module.css";

export function GroupJoinRequests() {
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const actor = useCommunity((state) => state.users.find((user) => user.id === state.session?.userId));
  const [total, setTotal] = useState<{ owner: string; count: number }>();
  const countId = useId();
  const owner = actor?.role === "ADMIN" && actor.status === "APPROVED" ? actor.id : undefined;
  const updateCount = useCallback((owner: string, count: number) => {
    if (useCommunity.getState().session?.userId === owner) setTotal({ owner, count });
  }, []);
  useEffect(() => {
    if (!owner || open) return;
    let active = true, pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const requests = await groupsService.joinRequests();
        if (active) updateCount(owner, requests.length);
      } catch { /* Keep the last confirmed count; the dialog offers retry. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    window.addEventListener("focus", refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [owner, open, updateCount]);
  if (actor?.role !== "ADMIN") return null;
  const count = total && total.owner === owner ? total.count : undefined;
  return <>
    <Button variant="secondary" aria-label={t("Demandes d’adhésion")} aria-describedby={count === undefined ? undefined : countId} onClick={() => setOpen(true)}><Inbox size={17} aria-hidden="true" />{t("Demandes d’adhésion")}
      {count !== undefined && <span id={countId} className="count-badge" aria-live="polite"><span aria-hidden="true">{count}</span><span className="sr-only">{t("{count} demande(s) en attente", { count })}</span></span>}
    </Button>
    {open && <Requests key={actor.id} owner={actor.id} onCount={updateCount} close={() => setOpen(false)} />}
  </>;
}

function Requests({ owner, close, onCount }: { owner: string; close: () => void; onCount: (owner: string, count: number) => void }) {
  const { t, locale, error: failure } = useCopy();
  const [requests, setRequests] = useState<GroupJoinRequest[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<{ name: string; error: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ name: "", email: "", role: "ALL" });
  const [page, setPage] = useState(1);
  const pending = useRef(false);
  const generation = useRef(0);
  const invalidate = useCallback(() => { generation.current++; }, []);
  const load = useCallback(async () => {
    if (pending.current) return;
    const version = ++generation.current;
    try {
      const next = await groupsService.joinRequests();
      if (useCommunity.getState().session?.userId !== owner || version !== generation.current) return;
      setRequests(next); setError("");
      onCount(owner, next.length);
    } catch (reason) {
      if (useCommunity.getState().session?.userId === owner && version === generation.current)
        setError(reason instanceof Error ? reason.message : "Opération impossible.");
    }
  }, [owner, onCount]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    const timer = setInterval(() => void load(), 30000);
    return () => { active = false; invalidate(); clearInterval(timer); };
  }, [load, invalidate]);
  const terms = filters.name.trim().toLocaleLowerCase(locale).split(/\s+/).filter(Boolean);
  const results = (requests ?? []).filter((request) =>
    terms.every((term) => `${request.user.firstName} ${request.user.lastName}`.toLocaleLowerCase(locale).includes(term)) &&
    request.user.email.toLocaleLowerCase(locale).includes(filters.email.trim().toLocaleLowerCase(locale)) &&
    (filters.role === "ALL" || request.user.role === filters.role));
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const rows = results.slice((currentPage - 1) * 10, currentPage * 10);
  const selected = (requests ?? []).filter((request) => selectedIds.includes(request.id));
  const pageSelected = rows.filter((request) => selectedIds.includes(request.id)).length;
  function update(patch: Partial<typeof filters>) { setFilters((previous) => ({ ...previous, ...patch })); setSelectedIds([]); setPage(1); }
  async function review(targets: GroupJoinRequest[], status: "APPROVED" | "REJECTED") {
    if (pending.current || !targets.length) return;
    pending.current = true; generation.current++; setBusy(true); setError(""); setMessage(""); setErrors([]);
    try {
      const outcome = await runSelectedActions(targets, (request) => groupsService.reviewJoinRequest(request.id, status),
        () => useCommunity.getState().session?.userId === owner && useCommunity.getState().users.some((user) => user.id === owner && user.role === "ADMIN"));
      if (useCommunity.getState().session?.userId !== owner) return;
      setRequests((previous) => previous?.filter((item) => !outcome.succeeded.includes(item.id)));
      onCount(owner, (requests ?? []).filter((item) => !outcome.succeeded.includes(item.id)).length);
      setSelectedIds((previous) => previous.filter((id) => !outcome.succeeded.includes(id)));
      setErrors(outcome.failed.map(({ item, error }) => ({ name: `${item.user.firstName} ${item.user.lastName} · ${item.group.name}`, error })));
      if (outcome.succeeded.length === 1 && targets.length === 1) setMessage(status === "APPROVED" ? t("Demande acceptée. Le membre peut accéder au groupe.") : t("Demande refusée."));
      else if (outcome.succeeded.length) setMessage(t(status === "APPROVED" ? "{count} demande(s) acceptée(s)" : "{count} demande(s) refusée(s)", { count: outcome.succeeded.length }));
      if (outcome.succeeded.length) await useCommunity.getState().sync();
    } finally { pending.current = false; setBusy(false); }
  }
  return <Modal open className={styles.wideModal} title={t("Demandes d’adhésion aux groupes")} onClose={() => { if (!busy) close(); }}>
    <section className={styles.requests} aria-label={t("Demandes d’adhésion aux groupes")}>
      <div className="row wrap between"><p className="small muted">{t("Clients et collaborateurs attendent votre décision pour accéder à ces groupes.")}</p>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => void load()}>{t("Actualiser")}</Button></div>
      <fieldset className={styles.filters} disabled={busy}>
        <legend className="sr-only">{t("Filtrer les demandes")}</legend>
        <label>{t("Nom ou prénom")}<span className="request-search-input"><Search size={16} aria-hidden="true" /><input type="search" maxLength={120} value={filters.name} onChange={(event) => update({ name: event.target.value })} /></span></label>
        <label>{t("E-mail")}<input type="search" maxLength={254} value={filters.email} onChange={(event) => update({ email: event.target.value })} /></label>
        <label>{t("Rôle")}<select value={filters.role} onChange={(event) => update({ role: event.target.value })}><option value="ALL">{t("Tous les rôles")}</option><option value="USER">{t("Client")}</option><option value="COLLABORATOR">{t("Collaborateur")}</option></select></label>
      </fieldset>
      <div className={bulkStyles.toolbar} aria-label={t("Actions sur les demandes sélectionnées")}>
        <label className={bulkStyles.pageSelection}><input className={bulkStyles.selection} type="checkbox" aria-label={t("Sélectionner les demandes de cette page")}
          checked={rows.length > 0 && pageSelected === rows.length} aria-checked={pageSelected > 0 && pageSelected < rows.length ? "mixed" : rows.length > 0 && pageSelected === rows.length}
          ref={(input) => { if (input) input.indeterminate = pageSelected > 0 && pageSelected < rows.length; }} disabled={busy || !rows.length}
          onChange={(event) => setSelectedIds((previous) => event.target.checked ? [...new Set([...previous, ...rows.map((row) => row.id)])] : previous.filter((id) => !rows.some((row) => row.id === id)))} />{t("Sélectionner les demandes de cette page")}</label>
        <strong>{t("{count} sélectionné(s)", { count: selected.length })}</strong>
        <div className="row wrap"><Button size="sm" disabled={busy || !selected.length} onClick={() => void review(selected, "APPROVED")}>{t("Accepter la sélection")}</Button>
          <Button size="sm" variant="secondary" disabled={busy || !selected.length} onClick={() => void review(selected, "REJECTED")}>{t("Refuser la sélection")}</Button>
          <Button size="sm" variant="ghost" disabled={busy || !selected.length} onClick={() => setSelectedIds([])}>{t("Effacer la sélection")}</Button></div>
        <p className="tiny muted">{t("La sélection est conservée entre les pages et effacée lors d’un changement de filtre.")}</p>
      </div>
      {error && <p className="error" role="alert">{failure(error)}</p>}
      {message && <p role="status">{message}</p>}
      {!!errors.length && <div role="alert"><p>{t("Les éléments en échec restent sélectionnés.")}</p><ul>{errors.map((item) => <li key={item.name}>{item.name} : {failure(item.error)}</li>)}</ul></div>}
      {!requests && !error && <p role="status">{t("Chargement…")}</p>}
      {requests && <p className="small muted">{t("{count} résultat(s) sur {total} demande(s)", { count: results.length, total: requests.length })}</p>}
      <div className={`table-wrap request-table ${styles.table}`} role="region" aria-label={t("Liste des demandes d’adhésion")} tabIndex={0} aria-busy={busy}>
        <table><thead><tr>
          <th scope="col" className={bulkStyles.selectionCell}><span className="sr-only">{t("Sélection")}</span></th>
          <th scope="col">{t("Membre")}</th><th scope="col">{t("Rôle")}</th><th scope="col">{t("Groupe")}</th><th scope="col">{t("Date")}</th><th scope="col">{t("Actions")}</th>
        </tr></thead><tbody>{rows.map((request) => <tr key={request.id} aria-label={`${request.user.firstName} ${request.user.lastName} · ${request.group.name}`}>
          <td data-label={t("Sélection")}><input className={bulkStyles.selection} type="checkbox" aria-label={t("Sélectionner la demande de {name} pour {group}", { name: `${request.user.firstName} ${request.user.lastName}`, group: request.group.name })}
            disabled={busy} checked={selectedIds.includes(request.id)} onChange={(event) => setSelectedIds((previous) => event.target.checked ? [...previous, request.id] : previous.filter((id) => id !== request.id))} /></td>
          <td data-label={t("Membre")}><strong>{request.user.firstName} {request.user.lastName}</strong><p className="small muted">{request.user.email}</p></td>
          <td data-label={t("Rôle")}>{t(request.user.role === "COLLABORATOR" ? "Collaborateur" : "Client")}</td>
          <td data-label={t("Groupe")}>{request.group.name}</td>
          <td data-label={t("Date")}><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString(locale)}</time></td>
          <td data-label={t("Actions")}><div className="row wrap"><Button size="sm" disabled={busy} onClick={() => void review([request], "APPROVED")}>{t("Accepter")}</Button><Button size="sm" variant="secondary" disabled={busy} onClick={() => void review([request], "REJECTED")}>{t("Refuser")}</Button></div></td>
        </tr>)}</tbody></table>
      </div>
      {requests && !results.length && <p className="muted">{t(requests.length ? "Aucune demande ne correspond aux filtres." : "Aucune demande d’adhésion en attente.")}</p>}
      {requests && <nav className="row wrap between request-pagination" aria-label={t("Pagination des demandes d’adhésion")}>
        <Button variant="secondary" disabled={busy || currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t("Précédent")}</Button>
        <span>{t("Page")} {currentPage} {t("sur")} {pages}</span>
        <Button variant="secondary" disabled={busy || currentPage === pages} onClick={() => setPage(currentPage + 1)}>{t("Suivant")}</Button>
      </nav>}
    </section>
  </Modal>;
}
