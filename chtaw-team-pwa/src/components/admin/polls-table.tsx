"use client";
import { useState, type ReactNode } from "react";
import { CalendarDays, ChartNoAxesColumn, ClipboardCheck, Clock3, Eye, Pencil, Users } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { pollGroupNames } from "@/features/poll-groups";
import type { Group, Poll } from "@/types";
import { Button } from "@/components/ui/button";
import { DeleteContent } from "@/components/delete-content";
import memberStyles from "./members-panel.module.css";
import styles from "./polls-table.module.css";
import bulkStyles from "./bulk-actions.module.css";
import { PageSelection, SelectionToolbar, useTableSelection } from "./table-selection";
import { PollBulkDelete } from "./poll-bulk-delete";
import { useCommunity } from "@/stores/community";

export function PollsTable({ polls, groups, canManage, badge, dateTime, onResults, onEdit, onManage, selectionScope = "" }: {
  polls: Poll[]; groups: Group[]; canManage: boolean;
  badge: (poll: Poll) => ReactNode; dateTime: (date: string) => string;
  onResults: (poll: Poll) => void; onEdit: (poll: Poll) => void; onManage: (poll: Poll) => void;
  selectionScope?: string;
}) {
  const { t } = useCopy();
  const selection = useTableSelection(selectionScope);
  const [bulkBusy, setBulkBusy] = useState(false);
  const store = useCommunity();
  const actor = store.users.find(user => user.id === store.session?.userId);
  const selectable = (poll: Poll) => actor?.role === "ADMIN" || (actor?.role === "COLLABORATOR" && poll.authorId === actor.id);
  const selected = store.polls.filter(poll => selection.ids.includes(poll.id) && selectable(poll));
  if (!polls.length) return null;
  return <div className={memberStyles.panel}>
    {canManage && <>
      <PageSelection ids={polls.filter(selectable).map(poll => poll.id)} selected={selection.ids} disabled={bulkBusy} label={t("Sélectionner les sondages de cette page")} onChange={selection.toggle} />
      <SelectionToolbar count={selected.length} clear={selection.clear} busy={bulkBusy}>
        <PollBulkDelete selected={selected} onDone={ids => selection.toggle(ids, false)} onBusy={setBulkBusy} />
      </SelectionToolbar>
    </>}
    <div className={`table-wrap request-table ${memberStyles.table} ${styles.table} ${canManage ? styles.selectionTable : ""}`} role="region" aria-label={t("Tous les sondages")} tabIndex={0}>
      <table>
        <caption className="sr-only">{t("Tous les sondages")}</caption>
        <thead><tr>{canManage && <th scope="col" className={bulkStyles.selectionCell}><span className="sr-only">{t("Sélection")}</span></th>}{["Sondage", "Groupe", "Date et horaire", "Statut", "Actions"].map(label => <th scope="col" key={label}>{t(label)}</th>)}</tr></thead>
        <tbody inert={bulkBusy}>{polls.map(poll => {
          const session = poll.type === "SESSION";
          const Icon = session ? CalendarDays : ChartNoAxesColumn;
          return <tr key={poll.id} className={`${memberStyles.memberRow} ${styles.row}`} data-selected={selection.ids.includes(poll.id) || undefined}>
            {canManage && <td data-label={t("Sélection")} className={`${bulkStyles.selectionCell} ${styles.selectionCell}`}><input type="checkbox" className={bulkStyles.selection}
              aria-label={t("Sélectionner {name}", { name: poll.question })} disabled={bulkBusy || !selectable(poll)} checked={selection.ids.includes(poll.id)} onChange={event => selection.toggle([poll.id], event.target.checked)} /></td>}
            <td data-label={t("Sondage")} className={memberStyles.identity}>
              <div className={memberStyles.member}>
                <span className={styles.icon}><Icon size={18} aria-hidden="true" /></span>
                <div className={`${memberStyles.memberText} ${styles.identityText}`}>
                  <strong>{poll.question}</strong>
                  <span className={styles.kind}>{t(session ? "Sondage de séance" : "Sondage simple")}</span>
                  <span className={styles.participants}><Users size={13} aria-hidden="true" />{poll.votes.length} {t(session ? "inscrit(s)" : "réponse(s)")}</span>
                </div>
              </div>
            </td>
            <td data-label={t("Groupe")} className={styles.group}>{pollGroupNames(poll, groups) || t("Groupe indisponible")}</td>
            <td data-label={t("Date et horaire")} className={styles.schedule}>
              {session ? <ul className={styles.slots}>{poll.options.slice(0, 2).map(option => <li key={option.id}>
                <CalendarDays size={13} aria-hidden="true" /><span>{option.label}{option.startsAt && <><br /><time dateTime={option.startsAt}>{dateTime(option.startsAt)}</time></>}</span>
              </li>)}{poll.options.length > 2 && <li className="tiny muted">+ {poll.options.length - 2} {t("autre(s) horaire(s), dans les détails")}</li>}</ul> : <span className="muted">—</span>}
              {poll.endsAt && <span className={styles.deadline}><Clock3 size={13} aria-hidden="true" /><time dateTime={poll.endsAt}>{session && <>{t("Inscriptions jusqu’au")} </>}{dateTime(poll.endsAt)}</time></span>}
            </td>
            <td data-label={t("Statut")} className={memberStyles.status}>{badge(poll)}</td>
            <td data-label={t("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}>
              <div className={`${memberStyles.actions} ${memberStyles.approvedActions} ${styles.actions}`}>
                <Button variant="secondary" size="sm" aria-label={`${t("Voir les résultats")} : ${poll.question}`} onClick={() => onResults(poll)}><Eye size={14} aria-hidden="true" />{t("Voir les résultats")}</Button>
                <DeleteContent poll={poll} />
                {session && canManage && <>
                  <Button size="sm" variant="secondary" disabled={poll.status === "CANCELLED"} onClick={() => onEdit(poll)}><Pencil size={14} aria-hidden="true" />{t("Modifier / annuler")}</Button>
                  <Button size="sm" variant="secondary" aria-label={`${t("Gérer la séance")} : ${poll.question}`} onClick={() => onManage(poll)}><ClipboardCheck size={14} aria-hidden="true" />{t("Gérer la séance")}</Button>
                </>}
              </div>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </div>;
}
