"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, CheckCircle2, Clock3, History, BarChart3, Plus, RefreshCw } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { PollVoteResults } from "./poll-vote-results";
import { SessionManagement } from "./session-management";
import { CALENDAR_TIME_ZONE, addCalendarDays, calendarDay, calendarWeek, calendarWeeks, calendarSlots, calendarSlotStatus, isCalendarDay, slotsInWeek } from "@/features/admin-calendar";
import styles from "./admin-calendar.module.css";

const statusLabels = { UPCOMING: "À venir", ONGOING: "En cours", COMPLETED: "Achevé", CANCELLED: "Annulé", PAST_WITHOUT_END: "Horaire passé" };

export function AdminCalendar({ initialWeek = "" }: { initialWeek?: string }) {
  const store = useCommunity();
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const prefix = actor?.role === "COLLABORATOR" ? "/collaborator" : "/admin";
  const { text: copy, locale } = useCopy();
  const [now, setNow] = useState(() => Date.now());
  const [selectedWeek, setSelectedWeek] = useState<string | null>(() => isCalendarDay(initialWeek) ? calendarWeek(initialWeek) : null);
  const [groupId, setGroupId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30000);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); document.removeEventListener("visibilitychange", update); };
  }, []);
  const today = calendarDay(now);
  const current = calendarWeek(today);
  const week = selectedWeek ?? current;
  const allSlots = useMemo(() => calendarSlots(store.polls.filter((poll) => poll.authorId === actor?.id)), [store.polls, actor?.id]);
  const filtered = allSlots.filter((slot) => !groupId || slot.groupId === groupId);
  const visible = slotsInWeek(filtered, week);
  const weeks = calendarWeeks(filtered, current, week);
  const past = weeks.filter((value) => value < current).reverse();
  const future = weeks.filter((value) => value > current);
  const days = Array.from({ length: 7 }, (_, index) => addCalendarDays(week, index));
  const detail = store.polls.find((poll) => poll.id === detailId);
  const managed = store.polls.find((poll) => poll.id === manageId);
  const displayDate = (day: string, weekday = false) => new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, {
    timeZone: CALENDAR_TIME_ZONE, day: "numeric", month: "short", ...(weekday ? { weekday: "long" as const } : { year: "numeric" as const }),
  });
  const weekLabel = (value: string) => `${displayDate(value)} — ${displayDate(addCalendarDays(value, 6))}`;
  const time = (instant: string) => new Date(instant).toLocaleTimeString(locale, { timeZone: CALENDAR_TIME_ZONE, hour: "2-digit", minute: "2-digit" });
  const changeWeek = (value: string) => setSelectedWeek(value === current ? null : value);
  const error = store.syncErrors.polls || store.syncErrors.groups || store.error;

  return (
    <div className={`admin-page ${styles.page}`}>
      <header className="page-heading">
        <div><span className="eyebrow">{copy(actor?.role === "COLLABORATOR" ? "ESPACE COLLABORATEUR" : "ESPACE ADMIN")}</span><h1>{copy(actor?.role === "COLLABORATOR" ? "Mon calendrier" : "Calendrier admin")}</h1>
          <p className="muted">{copy("Retrouvez automatiquement les créneaux de vos sondages de séance, semaine par semaine.")}</p></div>
        <Button asChild><Link href={`${prefix}/polls?create=session`}><Plus size={16} aria-hidden="true" />{copy("Créer un sondage de séance")}</Link></Button>
      </header>
      <section className={`panel ${styles.calendar}`} aria-label={copy("Calendrier hebdomadaire")} aria-busy={store.loading}>
        <div className={styles.toolbar}>
          <div><span className={styles.mode}>{week < current ? <History size={16} aria-hidden="true" /> : <CalendarDays size={16} aria-hidden="true" />}{copy(week < current ? "Historique" : week === current ? "Cette semaine" : "Semaine à venir")}</span>
            <h2 aria-live="polite">{weekLabel(week)}</h2><p className="tiny muted">{copy("Du lundi au dimanche · Heure de Tunis")}</p></div>
          <div className={styles.navigation}>
            <Button size="icon" variant="secondary" aria-label={copy("Semaine précédente")} onClick={() => changeWeek(addCalendarDays(week, -7))}><ChevronLeft size={18} aria-hidden="true" /></Button>
            <Button variant="secondary" onClick={() => setSelectedWeek(null)}>{copy("Cette semaine")}</Button>
            <Button size="icon" variant="secondary" aria-label={copy("Semaine suivante")} onClick={() => changeWeek(addCalendarDays(week, 7))}><ChevronRight size={18} aria-hidden="true" /></Button>
          </div>
        </div>
        <div className={styles.filters}>
          <label>{copy("Choisir une semaine")}<select value={week} onChange={(event) => changeWeek(event.target.value)}>
            <option value={current}>{copy("Cette semaine")} · {weekLabel(current)}</option>
            {!!future.length && <optgroup label={copy("Semaines à venir")}>{future.map((value) => <option key={value} value={value}>{weekLabel(value)}</option>)}</optgroup>}
            {!!past.length && <optgroup label={copy("Historique")}>{past.map((value) => <option key={value} value={value}>{weekLabel(value)}</option>)}</optgroup>}
          </select></label>
          <label>{copy("Groupe")}<select value={groupId} onChange={(event) => setGroupId(event.target.value)}><option value="">{copy("Tous les groupes")}</option>{store.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <Button variant="secondary" disabled={store.loading} onClick={() => void store.sync()}><RefreshCw size={15} aria-hidden="true" />{copy("Actualiser")}</Button>
        </div>
        <div className={styles.summary} aria-label={copy("Bilan de la semaine")}>
          <span><CalendarDays size={16} aria-hidden="true" /><strong>{visible.length}</strong>{copy("créneau(x)")}</span>
          <span><CheckCircle2 size={16} aria-hidden="true" /><strong>{visible.filter((slot) => calendarSlotStatus(slot, now) === "COMPLETED").length}</strong>{copy("achevé(s)")}</span>
          <span><Clock3 size={16} aria-hidden="true" /><strong>{visible.filter((slot) => calendarSlotStatus(slot, now) === "UPCOMING").length}</strong>{copy("à venir")}</span>
        </div>
        {store.loading && <p role="status" className="small muted">{copy("Actualisation du calendrier…")}</p>}
        {error && <div className="request-error" role="alert"><p>{copy("Le calendrier n’a pas pu être actualisé. Les créneaux affichés peuvent être incomplets.")}</p><Button size="sm" variant="secondary" disabled={store.loading} onClick={() => void store.sync()}>{copy("Réessayer")}</Button></div>}
        {!visible.length && !store.loading && !error && <p className={styles.empty} role="status">{copy("Aucun créneau enregistré pour cette semaine.")}</p>}
        <div className={styles.week}>
          {days.map((day) => <section key={day} className={styles.day} data-today={day === today} aria-label={displayDate(day, true)}>
            <h3><time dateTime={day}>{displayDate(day, true)}</time>{day === today && <span>{copy("Aujourd’hui")}</span>}</h3>
            <div className={styles.events}>
              {visible.filter((slot) => slot.firstDay <= day && slot.lastDay >= day).map((slot) => {
                const status = calendarSlotStatus(slot, now);
                return <article key={slot.id} className={styles.event} data-state={status}>
                  <span className={styles.status}>{status === "COMPLETED" && <CheckCircle2 size={13} aria-hidden="true" />}{copy(statusLabels[status])}</span>
                  <h4>{slot.question}</h4><p className={styles.group}>{store.groups.find((group) => group.id === slot.groupId)?.name ?? copy("Groupe indisponible")}</p>
                  <p>{slot.label}</p><p className={styles.time}><time dateTime={slot.startsAt}>{slot.firstDay !== day ? `${displayDate(slot.firstDay)} · ` : ""}{time(slot.startsAt)}</time>{slot.endsAt && <> — <time dateTime={slot.endsAt}>{calendarDay(slot.endsAt) !== day ? `${displayDate(calendarDay(slot.endsAt))} · ` : ""}{time(slot.endsAt)}</time></>}</p>
                  {!slot.endsAt && <p className="tiny muted">{copy("Fin non renseignée")}</p>}
                  <Button variant="secondary" size="sm" aria-label={copy("Voir les votes : {title} · {slot}", { title: slot.question, slot: slot.label })} onClick={() => { setDetailId(slot.pollId); void store.sync(); }}><BarChart3 size={14} aria-hidden="true" />{copy("Voir les votes")}</Button>
                </article>;
              })}
              {!visible.some((slot) => slot.firstDay <= day && slot.lastDay >= day) && <p className={styles.noEvents}>{copy("Aucun créneau")}</p>}
            </div>
          </section>)}
        </div>
        <p className={styles.note}>{copy("À chaque nouvelle semaine, la vue courante se renouvelle automatiquement. Les semaines passées restent accessibles dans l’historique.")}</p>
      </section>
      {detail && <Modal open onClose={() => setDetailId(null)} title={copy("Résultats du sondage")}><Button variant="secondary" onClick={() => { setManageId(detail.id); setDetailId(null); }}>{copy("Gérer la séance")}</Button><PollVoteResults poll={detail} /></Modal>}
      {managed && <SessionManagement poll={managed} close={() => setManageId(null)} />}
    </div>
  );
}
