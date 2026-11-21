"use client";
import { useId, useState } from "react";
import { Check, Inbox, School, X } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { studentSchoolsService } from "@/services/student-schools.service";
import { useCommunity } from "@/stores/community";
import { Button } from "../ui/button";
import { LoadState, useRemote } from "./attendance-panel";
import styles from "./school-suggestions.module.css";
import memberStyles from "./members-panel.module.css";
import { Modal } from "../ui/dialog";
import { TablePagination } from "../ui/table-pagination";
import { tablePage } from "@/lib/pagination";

export function SchoolSuggestions({ onReviewed }: { onReviewed: () => void }) {
  const { t, error: failure } = useCopy();
  const remote = useRemote(studentSchoolsService.suggestions);
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const countId = useId();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("PENDING");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function review(id: string, decision: "APPROVED" | "REJECTED") {
    if (busy) return;
    setBusy(id); setError(""); setMessage("");
    try {
      await studentSchoolsService.review(id, decision);
      setMessage(decision === "APPROVED" ? "Suggestion acceptée. Les affectations manuelles sont conservées." : "Suggestion refusée. Les comptes étudiants sont conservés.");
      remote.refresh(); onReviewed(); void useCommunity.getState().sync();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(null); }
  }
  const results = remote.data?.filter(item => status === "ALL" || item.status === status) ?? [];
  const visiblePage = tablePage(results, page);
  const pending = remote.data?.filter(item => item.status === "PENDING").length;
  return <>
    <Button variant="secondary" aria-label={t("Demandes d’établissement")} aria-describedby={pending === undefined ? undefined : countId} onClick={() => { setOpen(true); setStatus("PENDING"); setPage(1); remote.refresh(); }}>
      <Inbox size={17} aria-hidden="true" />{t("Demandes d’établissement")}
      {pending !== undefined && <span id={countId} className="count-badge" aria-live="polite"><span aria-hidden="true">{pending}</span><span className="sr-only">{t("{count} demande(s) en attente", { count: pending })}</span></span>}
    </Button>
    {open && <Modal open onClose={() => { if (!busy) setOpen(false); }} title={t("Suggestions d’établissements")} className={styles.modal}>
    <div className={`${memberStyles.panel} ${styles.panel}`}>
    <p className="small muted">{t("La validation d’un établissement ne modifie pas la validation du compte étudiant.")}</p>
    <label>{t("Statut de la suggestion")}<select value={status} disabled={!!busy} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="PENDING">{t("En attente")}</option><option value="APPROVED">{t("Acceptée")}</option><option value="REJECTED">{t("Refusée")}</option><option value="ALL">{t("Toutes")}</option>
    </select></label>
    <LoadState {...remote} retry={remote.refresh} />
    {error && <p role="alert" className="error">{failure(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {!remote.loading && !remote.error && !results.length && <p>{t("Aucune suggestion dans cette catégorie.")}</p>}
    {!!results.length && <div className={`table-wrap request-table ${memberStyles.table} ${styles.table}`} role="region" aria-label={t("Suggestions d’établissements")} tabIndex={0}>
      <table><caption className="sr-only">{t("Suggestions d’établissements")}</caption>
        <thead><tr>{["Nom du lycée", "Étudiant(s) concerné(s)", "Statut", "Actions"].map(label => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
        <tbody>{visiblePage.items.map(item => <tr key={item.id} className={`${memberStyles.memberRow} ${styles.row}`}>
          <td data-label={t("Nom du lycée")} className={memberStyles.identity}><div className={memberStyles.member}><span className="avatar"><School size={18} aria-hidden="true" /></span><div className={memberStyles.memberText}><strong>{item.name}</strong></div></div></td>
          <td data-label={t("Étudiant(s) concerné(s)")} className={styles.students}><ul>{item.students.map(student => <li key={student.id}>{student.firstName} {student.lastName}{student.establishment && <span className="small muted"> · {student.establishment.name}</span>}</li>)}</ul></td>
          <td data-label={t("Statut")} className={memberStyles.status}><span className="badge">{t(item.status === "PENDING" ? "En attente" : item.status === "APPROVED" ? "Acceptée" : "Refusée")}</span></td>
          <td data-label={t("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}>{item.status === "PENDING" ? <div className={memberStyles.actions}><Button size="sm" disabled={!!busy} onClick={() => void review(item.id, "APPROVED")}><Check size={14} aria-hidden="true" />{t("Accepter")}</Button><Button size="sm" variant="destructive" disabled={!!busy} onClick={() => void review(item.id, "REJECTED")}><X size={14} aria-hidden="true" />{t("Refuser")}</Button></div> : <span className="muted">—</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>}
    <TablePagination page={visiblePage.page} total={results.length} onChange={setPage} disabled={!!busy || remote.loading} />
    </div>
    </Modal>}
  </>;
}
