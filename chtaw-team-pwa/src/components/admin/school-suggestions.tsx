"use client";
import { useState } from "react";
import { useCopy } from "@/lib/i18n";
import { studentSchoolsService } from "@/services/student-schools.service";
import { useCommunity } from "@/stores/community";
import { Button } from "../ui/button";
import { LoadState, useRemote } from "./attendance-panel";
import styles from "./school-suggestions.module.css";

export function SchoolSuggestions({ onReviewed }: { onReviewed: () => void }) {
  const { t, error: failure } = useCopy();
  const remote = useRemote(studentSchoolsService.suggestions);
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
  return <section className={`panel ${styles.panel}`} aria-label={t("Suggestions d’établissements")}>
    <h2>{t("Suggestions d’établissements")}</h2>
    <p className="small muted">{t("La validation d’un établissement ne modifie pas la validation du compte étudiant.")}</p>
    <label>{t("Statut de la suggestion")}<select value={status} onChange={event => setStatus(event.target.value)}>
      <option value="PENDING">{t("En attente")}</option><option value="APPROVED">{t("Acceptée")}</option><option value="REJECTED">{t("Refusée")}</option><option value="ALL">{t("Toutes")}</option>
    </select></label>
    <LoadState {...remote} retry={remote.refresh} />
    {error && <p role="alert" className="error">{failure(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {!remote.loading && !remote.error && !results.length && <p>{t("Aucune suggestion dans cette catégorie.")}</p>}
    <ul className={styles.list}>{results.map(item => <li key={item.id}>
      <div><h3>{item.name}</h3><span className="badge">{t(item.status === "PENDING" ? "En attente" : item.status === "APPROVED" ? "Acceptée" : "Refusée")}</span>
        <p className="small muted">{t("Étudiant(s) concerné(s)")}</p>
        <ul>{item.students.map(student => <li key={student.id}>{student.firstName} {student.lastName}{student.establishment ? ` · ${student.establishment.name}` : ""}</li>)}</ul>
      </div>
      {item.status === "PENDING" && <div className="row wrap"><Button disabled={!!busy} onClick={() => void review(item.id, "APPROVED")}>{t("Accepter")}</Button><Button variant="secondary" disabled={!!busy} onClick={() => void review(item.id, "REJECTED")}>{t("Refuser")}</Button></div>}
    </li>)}</ul>
  </section>;
}
