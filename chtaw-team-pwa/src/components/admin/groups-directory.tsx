"use client";
import { useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, Layers, LockKeyhole, MessageCircle, Pencil, Plus, RotateCcw, Search, ShieldCheck, SlidersHorizontal, Trash2, Users, X } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Avatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { Group } from "@/types";
import memberStyles from "./members-panel.module.css";
import styles from "./groups-directory.module.css";
import { GroupJoinRequests } from "@/components/groups/group-join-requests";

const tabs = [
  { value: "ALL", label: "Tous les groupes" },
  { value: "PRIVATE", label: "Groupes privés" },
  { value: "GENERAL", label: "Groupes système" },
] as const;
const defaults = { search: "", type: "ALL", order: "name", population: "all", min: "", max: "" };
const memberCount = (group: Group) => new Set(group.memberIds).size;
const validBound = (value: string) => !value || (Number.isInteger(Number(value)) && Number(value) >= 0);

export function GroupsDirectory({ onCreate, onEdit }: { onCreate: () => void; onEdit: (group: Group) => void }) {
  const { t, locale, error: failure } = useCopy();
  const store = useCommunity();
  const id = useId();
  const [filters, setFilters] = useState(defaults);
  const [advanced, setAdvanced] = useState(false);
  const [range, setRange] = useState({ min: "", max: "" });
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<Group | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const groups = [...new Map(store.groups.map((group) => [group.id, group])).values()];
  const counts = { ALL: groups.length, PRIVATE: groups.filter((group) => !group.isGeneral).length, GENERAL: groups.filter((group) => group.isGeneral).length };
  const people = new Set(groups.flatMap((group) => group.memberIds)).size;
  const update = (patch: Partial<typeof defaults>) => { setFilters((previous) => ({ ...previous, ...patch })); setPage(1); };
  const terms = filters.search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const results = groups.filter((group) => {
    const text = `${group.name} ${group.description}`.toLocaleLowerCase();
    const count = memberCount(group);
    return terms.every((term) => text.includes(term)) &&
      (filters.type === "ALL" || (filters.type === "GENERAL" ? group.isGeneral : !group.isGeneral)) &&
      (filters.population === "all" || (filters.population === "empty" ? count === 0 : count > 0)) &&
      (!filters.min || count >= Number(filters.min)) && (!filters.max || count <= Number(filters.max));
  }).sort((a, b) => {
    const name = a.name.localeCompare(b.name, locale, { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
    return filters.order === "name-desc" ? -name : filters.order === "members" ? memberCount(b) - memberCount(a) || name : filters.order === "members-asc" ? memberCount(a) - memberCount(b) || name : name;
  });
  const invalidRange = !validBound(range.min) || !validBound(range.max) || (!!range.min && !!range.max && Number(range.min) > Number(range.max));
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const loadError = store.syncErrors.groups;
  async function remove() {
    if (!deleting || deleting.isGeneral || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await store.deleteGroup(deleting.id); setDeleting(null); setMessage("Groupe supprimé"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Opération impossible."); }
    finally { setBusy(false); }
  }
  return <div className={styles.directory}>
    <header className={`page-heading requests-heading ${styles.heading}`}>
      <div><span className="eyebrow">{t("ADMINISTRATION · GROUPES")}</span><h1 id={`${id}-heading`}>{t("Gestion des groupes")}</h1><p className="muted">{t("Gérez les groupes, leurs membres et leurs conversations.")}</p></div>
      <div className="row wrap"><GroupJoinRequests /><Button onClick={onCreate}><Plus size={17} aria-hidden="true" />{t("Créer un groupe")}</Button></div>
    </header>
    <div className="stats-grid members-stats" aria-label={t("Statistiques des groupes")}>
      {[{ label: "Total des groupes", value: counts.ALL }, { label: "Groupes privés", value: counts.PRIVATE }, { label: "Groupes système", value: counts.GENERAL }, { label: "Personnes affectées", value: people }].map((stat) => <div className="stat-card" key={stat.label}><span>{t(stat.label)}</span><strong>{store.loading && !groups.length ? "…" : loadError && !groups.length ? "—" : stat.value}</strong></div>)}
    </div>
    <p className="tiny muted">{t("Chaque groupe est compté une fois. Une personne affectée à plusieurs groupes ne compte qu’une fois dans le total des personnes.")}</p>
    {message && <p role="status">{t(message)}</p>}
    <section className={`panel requests-panel ${memberStyles.panel}`} aria-labelledby={`${id}-heading`}>
      <div className={memberStyles.tabsShell}><div className="request-status-tabs" role="tablist" aria-label={t("Type de groupe")}>
        {tabs.map((tab, index) => <button type="button" role="tab" id={`${id}-${tab.value}`} key={tab.value} aria-selected={filters.type === tab.value} aria-controls={`${id}-results`} tabIndex={filters.type === tab.value ? 0 : -1} onClick={() => update({ type: tab.value })} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next === null) return; event.preventDefault(); update({ type: tabs[next].value }); document.getElementById(`${id}-${tabs[next].value}`)?.focus();
        }}>{t(tab.label)}<span>{counts[tab.value]}</span></button>)}
      </div></div>
      <div className="request-primary-filters">
        <label>{t("Rechercher un groupe")}<span className="request-search-input"><Search size={18} aria-hidden="true" /><input type="search" maxLength={254} value={filters.search} placeholder={t("Nom ou description…")} onChange={(event) => update({ search: event.target.value })} /></span></label>
        <label>{t("Trier les groupes")}<select value={filters.order} onChange={(event) => update({ order: event.target.value })}><option value="name">{t("Nom : A à Z")}</option><option value="name-desc">{t("Nom : Z à A")}</option><option value="members">{t("Plus de membres")}</option><option value="members-asc">{t("Moins de membres")}</option></select></label>
        <label>{t("Effectif")}<select value={filters.population} onChange={(event) => update({ population: event.target.value })}><option value="all">{t("Tous les groupes")}</option><option value="populated">{t("Avec des membres")}</option><option value="empty">{t("Sans membre")}</option></select></label>
      </div>
      <div className="request-filter-actions"><Button variant="ghost" size="sm" aria-expanded={advanced} aria-controls={`${id}-advanced`} onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={16} aria-hidden="true" />{t("Filtres avancés")}<ChevronDown size={15} className={advanced ? "request-chevron-open" : ""} aria-hidden="true" /></Button><Button variant="ghost" size="sm" onClick={() => { update(defaults); setRange({ min: "", max: "" }); setAdvanced(false); }}><RotateCcw size={14} aria-hidden="true" />{t("Réinitialiser")}</Button></div>
      <form id={`${id}-advanced`} className="request-advanced" hidden={!advanced} onSubmit={(event) => { event.preventDefault(); if (!invalidRange) update(range); }}>
        <div className="request-period-fields"><label>{t("Nombre minimum de membres")}<input type="number" min={0} step={1} value={range.min} aria-invalid={invalidRange} aria-describedby={invalidRange ? `${id}-range-error` : undefined} onChange={(event) => setRange((previous) => ({ ...previous, min: event.target.value }))} /></label><label>{t("Nombre maximum de membres")}<input type="number" min={0} step={1} value={range.max} aria-invalid={invalidRange} aria-describedby={invalidRange ? `${id}-range-error` : undefined} onChange={(event) => setRange((previous) => ({ ...previous, max: event.target.value }))} /></label><Button type="submit" size="sm" disabled={invalidRange || (range.min === filters.min && range.max === filters.max)}>{t("Appliquer les filtres")}</Button></div>
        {invalidRange && <p role="alert" id={`${id}-range-error`} className="error">{t("Saisissez des nombres entiers positifs ou nuls, avec un maximum supérieur ou égal au minimum.")}</p>}
      </form>
      <div id={`${id}-results`} role="tabpanel" aria-labelledby={`${id}-${filters.type}`} tabIndex={0} aria-busy={store.loading}>
        {loadError && <div role="alert"><p className="error">{failure(loadError)}</p><Button size="sm" variant="secondary" disabled={store.loading} onClick={() => void store.sync()}><RotateCcw size={14} aria-hidden="true" />{t("Réessayer")}</Button></div>}
        <p className="request-results-count" role="status" aria-live="polite">{store.loading ? t("Chargement…") : t("{count} résultat(s) sur {total} groupe(s)", { count: results.length, total: groups.length })}</p>
        <div className={`table-wrap request-table ${memberStyles.table}`} role="region" aria-label={t("Liste des groupes")} tabIndex={0}><table>
          <caption className={styles.srOnly}>{t("Liste des groupes")}</caption><thead><tr>{["Groupe", "Type", "Membres", "Description", "Actions"].map((label) => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
          <tbody>{results.slice((currentPage - 1) * 10, currentPage * 10).map((group) => <tr className={memberStyles.memberRow} key={group.id}>
            <td className={memberStyles.identity} data-label={t("Groupe")}><div className={memberStyles.member}><Avatar group={group} /><div className={memberStyles.memberText}><h2 className={styles.name}>{group.name}</h2></div></div></td>
            <td className={memberStyles.status} data-label={t("Type")}><span className={styles.badge}>{group.isGeneral ? <ShieldCheck size={13} aria-hidden="true" /> : <LockKeyhole size={13} aria-hidden="true" />}{t(group.isGeneral ? "Système" : "Privé")}</span></td>
            <td className={memberStyles.date} data-label={t("Membres")}><span className={styles.members}><Users size={14} aria-hidden="true" />{memberCount(group)}</span></td>
            <td className={`${memberStyles.groups} ${styles.description}`} data-label={t("Description")}><span title={group.description}>{group.description || t("Aucune description")}</span></td>
            <td className={memberStyles.actionsCell} data-label={t("Actions")}><div className={`${memberStyles.actions} ${memberStyles.approvedActions}`}>
              <Button size="sm" variant="secondary" asChild><Link href={`/admin/groups/${group.id}`}><Users size={15} aria-hidden="true" />{t("Gérer")}</Link></Button>
              <Button size="sm" variant="secondary" asChild><Link href={`/app/groups/${group.id}`}><MessageCircle size={15} aria-hidden="true" />{t("Ouvrir la conversation")}</Link></Button>
              <Button size="sm" onClick={() => onEdit(group)}><Pencil size={15} aria-hidden="true" />{t("Modifier")}</Button>
              {!group.isGeneral && <Button size="sm" variant="destructive" aria-label={t("Supprimer le groupe {name}", { name: group.name })} onClick={() => { setError(""); setDeleting(group); }}><Trash2 size={15} aria-hidden="true" />{t("Supprimer")}</Button>}
            </div></td>
          </tr>)}</tbody>
        </table></div>
        {!results.length && !store.loading && !loadError && <div className={styles.empty}><Layers size={32} aria-hidden="true" /><h2>{t("Aucun groupe trouvé.")}</h2><p>{t("Créez un groupe ou ajustez vos filtres.")}</p></div>}
        {pages > 1 && <div className={`row between ${styles.pagination}`}><Button size="sm" variant="secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>{t("Précédent")}</Button><span className="small muted">{t("Page {page} sur {pages}", { page: currentPage, pages })}</span><Button size="sm" variant="secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>{t("Suivant")}</Button></div>}
      </div>
    </section>
    {deleting && <Modal open onClose={() => { if (!busy) setDeleting(null); }} title={t("Supprimer ce groupe ?")}><div className="form-stack">
      <p><strong>{deleting.name}</strong></p><p>{t("Le groupe, ses messages et ses sondages seront supprimés définitivement. Cette action est irréversible.")}</p>
      {error && <p role="alert" className="error">{failure(error)}</p>}
      <div className="row wrap"><Button variant="secondary" disabled={busy} onClick={() => setDeleting(null)}><X size={16} aria-hidden="true" />{t("Annuler")}</Button><Button variant="destructive" disabled={busy} onClick={() => void remove()}><Trash2 size={16} aria-hidden="true" />{t(busy ? "Suppression…" : "Supprimer le groupe")}</Button></div>
    </div></Modal>}
  </div>;
}
