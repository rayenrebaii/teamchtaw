"use client";
import { TABLE_PAGE_SIZE } from "@/lib/pagination";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ClipboardCheck, Clock3, RefreshCw } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { calendarDay } from "@/features/admin-calendar";
import { attendanceSessionHref } from "@/features/attendance-navigation";
import { attendanceService } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { Empty } from "@/components/shared";
import { LoadState, useRemote } from "./attendance-panel";
import memberStyles from "./members-panel.module.css";
import styles from "./attendance-slot-search.module.css";

export function AttendanceSlotSearch({ initialPollId = "" }: { initialPollId?: string }) {
  const { text: copy, locale } = useCopy();
  const store = useCommunity();
  const actor = store.users.find(user => user.id === store.session?.userId);
  const [day, setDay] = useState("");
  const [groupId, setGroupId] = useState("");
  const [pollId, setPollId] = useState(initialPollId);
  const [page, setPage] = useState(1);
  const load = useCallback(() => attendanceService.sessions({
    page: String(page), ...(groupId ? { groupId } : {}), ...(pollId ? { pollId } : {}),
    ...(day ? { from: day, to: day } : {}),
  }), [day, groupId, page, pollId]);
  const remote = useRemote(load);
  const { refresh } = remote;
  useEffect(() => {
    const timer = window.setInterval(refresh, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const slots = (remote.data?.items ?? []).flatMap(session => session.options
    .filter(option => option.startsAt && (!day || calendarDay(option.startsAt) === day))
    .map(option => ({ session, option })));
  return <section className={`panel attendance-workspace-panel ${memberStyles.panel}`} aria-label={copy("Rechercher un horaire à pointer")}>
    <div className="row between wrap">
      <h2>{copy("Choisir un horaire")}</h2>
      <Button variant="ghost" size="sm" disabled={remote.loading} onClick={remote.refresh}><RefreshCw size={15} aria-hidden="true" />{copy("Actualiser")}</Button>
    </div>
    <p className="small muted">{copy("Choisissez une date et un groupe, puis ouvrez un horaire pour pointer les étudiants inscrits.")}</p>
    <div className="request-filters">
      <label>{copy("Date de séance")} <input type="date" value={day} onChange={event => { setDay(event.target.value); setPage(1); }} /></label>
      <label>{copy("Groupe")} <select value={groupId} onChange={event => { setGroupId(event.target.value); setPollId(""); setPage(1); }}>
        <option value="">{copy("Tous les groupes")}</option>
        {store.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
      </select></label>
      {(day || groupId || pollId) && <Button variant="ghost" size="sm" onClick={() => { setDay(""); setGroupId(""); setPollId(""); setPage(1); }}>{copy("Réinitialiser")}</Button>}
    </div>
    <p className="tiny muted">{copy("Dates et heures de Tunis. Les créneaux se valident automatiquement à leur début.")}</p>
    <LoadState {...remote} retry={remote.refresh} />
    {slots.length > 0 && <div className={`table-wrap request-table ${memberStyles.table} ${styles.table}`} role="region" aria-label={copy("Choisir un horaire")} tabIndex={0} aria-busy={remote.loading}>
      <table>
        <caption className="sr-only">{copy("Choisir un horaire")}</caption>
        <thead><tr>{["Séance", "Groupe", "Horaire", "Date et horaire", "Actions"].map(label => <th key={label} scope="col">{copy(label)}</th>)}</tr></thead>
        <tbody>{slots.map(({ session, option }) => <tr className={`${memberStyles.memberRow} ${styles.row}`} key={`${session.id}:${option.id}`}>
          <td data-label={copy("Séance")} className={memberStyles.identity}><div className={memberStyles.member}>
            <span className={styles.icon}><CalendarDays size={18} aria-hidden="true" /></span>
            <div className={memberStyles.memberText}><strong>{session.question}</strong></div>
          </div></td>
          <td data-label={copy("Groupe")} className={styles.group}>{session.groups?.map(group => group.name).join(" · ") || session.group.name}</td>
          <td data-label={copy("Horaire")} className={styles.slot}>{option.label}</td>
          <td data-label={copy("Date et horaire")} className={styles.date}><span className={styles.dateTime}><Clock3 size={14} aria-hidden="true" /><time dateTime={option.startsAt!}>{new Date(option.startsAt!).toLocaleString(locale, { timeZone: "Africa/Tunis", dateStyle: "medium", timeStyle: "short" })}</time></span></td>
          <td data-label={copy("Actions")} className={`${memberStyles.actionsCell} ${styles.actionsCell}`}><div className={memberStyles.actions}>
            <Button asChild size="sm"><Link href={`${attendanceSessionHref(session.id, actor?.role)}?slot=${encodeURIComponent(option.id)}`}><ClipboardCheck size={14} aria-hidden="true" />{copy("Ouvrir la liste")}</Link></Button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {!remote.loading && !remote.error && !slots.length && <Empty title={copy("Aucun horaire trouvé")}>
      {copy("Les prochains créneaux apparaîtront à leur heure de début. Vérifiez la date et le groupe sélectionnés.")}
      <br />
      <Link href={actor?.role === "COLLABORATOR" ? "/collaborator/polls" : "/admin/polls"}>{copy("Voir les sondages")}</Link>
    </Empty>}
    {remote.data && remote.data.total > TABLE_PAGE_SIZE && <nav className="row between wrap request-pagination" aria-label={copy("Pagination des séances")}>
      <Button size="sm" variant="secondary" disabled={remote.loading || page <= 1} onClick={() => setPage(page - 1)}>{copy("Précédent")}</Button>
      <span className="tiny">{copy("Page")} {page} / {Math.ceil(remote.data.total / TABLE_PAGE_SIZE)}</span>
      <Button size="sm" variant="secondary" disabled={remote.loading || page * TABLE_PAGE_SIZE >= remote.data.total} onClick={() => setPage(page + 1)}>{copy("Suivant")}</Button>
    </nav>}
  </section>;
}
