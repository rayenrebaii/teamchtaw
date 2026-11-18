"use client";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, UserX } from "lucide-react";
import { attendanceService, type PersonalAttendancePage } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import styles from "./student-attendance.module.css";
export function StudentAttendance() {
  const { t, locale, error } = useCopy();
  const owner = useCommunity((state) => state.session?.userId);
  const polls = useCommunity((state) => state.polls);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    upcoming?: PersonalAttendancePage;
    history?: PersonalAttendancePage;
    error?: string;
  }>();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Tunis";
  const key = JSON.stringify({ owner, upcomingPage, historyPage, timeZone, revision });
  const current = result?.key === key ? result : undefined;
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void Promise.all([
      attendanceService.mine({
        status: "UPCOMING",
        page: String(upcomingPage),
        order: "asc",
        timeZone,
      }),
      attendanceService.mine({
        phase: "HISTORY",
        page: String(historyPage),
        order: "desc",
        timeZone,
      }),
    ])
      .then(([upcoming, history]) => {
        if (upcoming.user.id !== owner || history.user.id !== owner)
          throw Error("La session a changé.");
        if (active) setResult({ key, upcoming, history });
      })
      .catch((reason: unknown) => {
        if (active)
          setResult({
            key,
            error: reason instanceof Error ? reason.message : "Une erreur est survenue.",
          });
      });
    return () => {
      active = false;
    };
  }, [key, owner, upcomingPage, historyPage, timeZone, polls]);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  const stats = current?.upcoming?.stats;
  const date = (value: string, withDate = true) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      ...(withDate ? ({ year: "numeric", month: "short", day: "numeric" } as const) : {}),
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  const section = (
    data: PersonalAttendancePage,
    upcoming: boolean,
    page: number,
    setPage: (value: number) => void,
  ) => {
    const pages = Math.max(1, Math.ceil(data.total / data.limit));
    return (
      <section
        className="personal-session-section"
        aria-labelledby={upcoming ? "my-upcoming-sessions" : "my-absences"}
      >
        <div className="row wrap between">
          <h2 id={upcoming ? "my-upcoming-sessions" : "my-absences"}>
            {upcoming ? t("Séances à venir") : t("Vos absences")}
          </h2>
          <span className="count-badge">{data.total}</span>
        </div>
        {!data.items.length && (
          <p className="panel muted">
            {upcoming ? t("Aucune séance à venir") : t("Aucune absence validée")}
          </p>
        )}
        <div className="personal-session-grid">
          {data.items.map((session) => (
            <article className="personal-session panel" key={session.id}>
              <div className="row wrap between">
                <span className="eyebrow">{session.groupName}</span>
                <span className={`badge personal-status-${upcoming ? "upcoming" : "absent"}`}>
                  {upcoming ? t("À venir") : t("Absent")}
                </span>
              </div>
              <h3>{session.question}</h3>
              {session.description && <p>{session.description}</p>}
              <ul className="personal-slots" aria-label={t("Créneaux de la séance")}>
                {session.slots.map((slot) => (
                  <li key={slot.optionId}>
                    <strong>{slot.label}</strong>
                    <span>{slot.startsAt ? date(slot.startsAt) : t("Date non renseignée")}</span>
                    {slot.endsAt && (
                      <span>
                        →{" "}
                        {date(
                          slot.endsAt,
                          slot.startsAt?.slice(0, 10) !== slot.endsAt.slice(0, 10),
                        )}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {!session.slots.length && <p>{t("Date non renseignée")}</p>}
            </article>
          ))}
        </div>
        {pages > 1 && (
          <nav
            className="row wrap between"
            aria-label={upcoming ? t("Séances à venir") : t("Vos absences")}
          >
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              {t("Précédent")}
            </Button>
            <span>{t("Page {page} sur {pages}", { page, pages })}</span>
            <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
              {t("Suivant")}
            </Button>
          </nav>
        )}
      </section>
    );
  };
  const history = current?.history;
  const historyPages = history ? Math.max(1, Math.ceil(history.total / history.limit)) : 1;
  const statusLabels = { UPCOMING: "À venir", PRESENT: "Présent", ABSENT: "Absent", PENDING: "En attente de pointage", CANCELLED: "Annulée" };
  return (
    <div className="account-page personal-attendance">
      <header className="page-heading">
        <div>
          <h1>{t("Mes présences")}</h1>
          <p className="muted">{t("Retrouvez vos prochaines séances et votre historique de présence.")}</p>
        </div>
        <CalendarDays aria-hidden="true" />
      </header>
      <div className="personal-stats" aria-label={t("Mes présences")}>
        {[
          { key: "completed", title: t("Séances terminées"), Icon: CalendarDays },
          { key: "present", title: t("Présences"), Icon: CheckCircle2 },
          { key: "absent", title: t("Absences"), Icon: UserX },
          { key: "upcoming", title: t("Séances à venir"), Icon: Clock3 },
        ].map(({ key, title, Icon }) => (
          <div className="stat-card" key={key}>
            <span>
              <Icon size={18} aria-hidden="true" /> {title}
            </span>
            <strong>{stats ? stats[key as keyof typeof stats] : "…"}</strong>
          </div>
        ))}
      </div>
      {!current && <p role="status">{t("Chargement…")}</p>}
      {current?.error && (
        <div role="alert">
          <p>{error(current.error)}</p>
          <Button onClick={() => setRevision((value) => value + 1)}>{t("Réessayer")}</Button>
        </div>
      )}
      {current?.upcoming && history && (
        <>
          {section(current.upcoming, true, upcomingPage, setUpcomingPage)}
          <section className="personal-session-section" aria-labelledby="my-attendance-history">
            <div className="row wrap between">
              <h2 id="my-attendance-history">{t("Historique de mes présences")}</h2>
              <span className="count-badge">{history.total}</span>
            </div>
            {!history.items.length ? <p className="panel muted">{t("Aucune séance dans votre historique")}</p> : (
              <div className={styles.tableWrap}>
                <table className={styles.table} role="table" aria-label={t("Historique de mes présences")}>
                  <thead><tr role="row">
                    {["Séance", "Groupe", "Date et horaire", "État"].map(label => <th key={label} scope="col" role="columnheader">{t(label)}</th>)}
                  </tr></thead>
                  <tbody>{history.items.map(session => <tr key={session.id} role="row">
                    <td role="cell" data-label={t("Séance")}><strong>{session.question}</strong></td>
                    <td role="cell" data-label={t("Groupe")}>{session.groupName}</td>
                    <td role="cell" data-label={t("Date et horaire")}>
                      <ul className={styles.dates}>{session.slots.map(slot => <li key={slot.optionId}>
                        <span>{slot.label}</span>
                        <span>{slot.startsAt ? date(slot.startsAt) : t("Date non renseignée")}{slot.endsAt ? ` → ${date(slot.endsAt, slot.startsAt?.slice(0, 10) !== slot.endsAt.slice(0, 10))}` : ""}</span>
                      </li>)}</ul>
                      {!session.slots.length && t("Date non renseignée")}
                    </td>
                    <td role="cell" data-label={t("État")}><span className={`badge personal-status-${session.attendanceStatus.toLowerCase()}`}>{t(statusLabels[session.attendanceStatus])}</span></td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
            {historyPages > 1 && <nav className="row wrap between" aria-label={t("Historique de mes présences")}>
              <Button variant="secondary" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>{t("Précédent")}</Button>
              <span>{t("Page {page} sur {pages}", { page: historyPage, pages: historyPages })}</span>
              <Button variant="secondary" disabled={historyPage >= historyPages} onClick={() => setHistoryPage(historyPage + 1)}>{t("Suivant")}</Button>
            </nav>}
          </section>
        </>
      )}
    </div>
  );
}
