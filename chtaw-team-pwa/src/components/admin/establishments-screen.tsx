"use client";
import { useState } from "react";
import { Pencil, Plus, School, Trash2 } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { establishmentsService, type Establishment } from "@/services/establishments.service";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Empty } from "@/components/shared";
import { LoadState, useRemote } from "./attendance-panel";
import styles from "./establishments.module.css";
import memberStyles from "./members-panel.module.css";
import { SchoolSuggestions } from "./school-suggestions";
import { tablePage } from "@/lib/pagination";
import { TablePagination } from "@/components/ui/table-pagination";

export function EstablishmentsScreen() {
  const { t, error: failure } = useCopy();
  const remote = useRemote(establishmentsService.list);
  const [page, setPage] = useState(1);
  const visiblePage = tablePage(remote.data ?? [], page);
  const [editor, setEditor] = useState<{ item?: Establishment } | null>(null);
  const [target, setTarget] = useState<Establishment | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function openEditor(item?: Establishment) {
    setName(item?.name ?? ""); setError(""); setMessage(""); setEditor({ item });
  }
  async function save() {
    if (!editor || busy) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 120) {
      setError(!trimmed ? "Le nom du lycée est obligatoire." : "Le nom du lycée ne doit pas dépasser 120 caractères.");
      return;
    }
    setBusy(true); setError("");
    try {
      if (editor.item) await establishmentsService.update(editor.item.id, trimmed);
      else await establishmentsService.create(trimmed);
      setMessage(editor.item ? "Établissement modifié." : "Établissement ajouté.");
      setEditor(null); remote.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!target || busy) return;
    setBusy(true); setError("");
    try {
      await establishmentsService.remove(target.id);
      setMessage("Établissement supprimé."); setTarget(null); remote.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); }
  }

  return <div className={`admin-page ${styles.page}`}>
    <header className={`page-heading ${styles.heading}`}>
      <div><span className="eyebrow">{t("ESPACE ADMIN · ÉTABLISSEMENTS")}</span><h1>{t("Établissements")}</h1><p className="muted">{t("Gérez la liste des lycées.")}</p></div>
      <div className={`row wrap ${styles.headingActions}`}><SchoolSuggestions onReviewed={remote.refresh} /><Button onClick={() => openEditor()}><Plus size={17} aria-hidden="true" />{t("Ajouter un établissement")}</Button></div>
    </header>
    <div className={styles.stats}>
      <div className="stat-card"><span>{t("Total des établissements")}</span><strong>{remote.loading ? "…" : remote.error && !remote.data ? "—" : remote.data?.length ?? 0}</strong></div>
    </div>
    {message && <p role="status" className={styles.success}>{t(message)}</p>}
    <section className={`panel requests-panel ${memberStyles.panel} ${styles.list}`} aria-label={t("Liste des établissements")} aria-busy={remote.loading}>
      <div className={styles.listHeading}><h2>{t("Tous les établissements")}</h2><span>{remote.data?.length ?? "—"}</span></div>
      <LoadState {...remote} retry={remote.refresh} />
      {!remote.loading && !remote.error && !remote.data?.length && <Empty title={t("Aucun établissement")}>{t("Ajoutez votre premier lycée.")}</Empty>}
      {!!remote.data?.length && <div className={`table-wrap request-table ${memberStyles.table} ${styles.table}`} role="region" aria-label={t("Liste des établissements")} tabIndex={0}><table>
        <caption className="sr-only">{t("Liste des établissements")}</caption>
        <thead><tr><th scope="col">{t("Nom du lycée")}</th><th scope="col">{t("Actions")}</th></tr></thead>
        <tbody>{visiblePage.items.map(item => <tr key={item.id} className={`${memberStyles.memberRow} ${styles.row}`}>
          <td data-label={t("Nom du lycée")} className={memberStyles.identity}><div className={memberStyles.member}><span className="avatar"><School size={19} aria-hidden="true" /></span><div className={memberStyles.memberText}><strong>{item.name}</strong></div></div></td>
          <td data-label={t("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}><div className={`${memberStyles.actions} ${styles.rowActions}`}>
            <Button variant="secondary" size="sm" disabled={busy || remote.loading} aria-label={t("Modifier {name}", { name: item.name })} onClick={() => openEditor(item)}><Pencil size={15} aria-hidden="true" />{t("Modifier")}</Button>
            <Button variant="destructive" size="sm" disabled={busy || remote.loading} aria-label={t("Supprimer {name}", { name: item.name })} onClick={() => { setError(""); setMessage(""); setTarget(item); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>
          </div></td>
        </tr>)}</tbody>
      </table></div>}
      <TablePagination page={visiblePage.page} total={remote.data?.length ?? 0} onChange={setPage} disabled={busy || remote.loading} />
    </section>
    <Modal open={!!editor} onClose={() => { if (!busy) setEditor(null); }} title={t(editor?.item ? "Modifier l’établissement" : "Ajouter un établissement")}>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); void save(); }}>
        <label htmlFor="establishment-name">{t("Nom du lycée")}</label>
        <input id="establishment-name" name="name" autoComplete="off" required maxLength={120} value={name} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "establishment-error" : undefined} onChange={event => { setName(event.target.value); setError(""); }} />
        {error && <p id="establishment-error" className="error" role="alert">{failure(error)}</p>}
        <div className={styles.actions}><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditor(null)}>{t("Annuler")}</Button><Button type="submit" disabled={busy}>{t(busy ? "Enregistrement…" : "Enregistrer")}</Button></div>
      </form>
    </Modal>
    <Modal open={!!target} onClose={() => { if (!busy) setTarget(null); }} title={t("Supprimer cet établissement ?")}>
      <p>{t("L’établissement « {name} » sera définitivement supprimé.", { name: target?.name ?? "" })}</p>
      {error && <p className="error" role="alert">{failure(error)}</p>}
      <div className={styles.actions}><Button variant="secondary" disabled={busy} onClick={() => setTarget(null)}>{t("Annuler")}</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}>{t(busy ? "Suppression…" : "Supprimer")}</Button></div>
    </Modal>
  </div>;
}
