"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { CalendarDays, CheckCheck, Layers, Percent, RotateCcw, ShieldAlert, TrendingUp, Users } from "lucide-react";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { analyticsParams, analyticsService, defaultAnalyticsFilters, type AnalyticsFilters, type AnalyticsInterval, type AnalyticsPeriod } from "@/services/analytics.service";
import { attendanceSessionHref } from "@/features/attendance-navigation";
import { LoadState, useRemote } from "./attendance-panel";
import { AnalyticsPagination, AttendanceLegend, ComparisonRow, dashboardDate, RegistrationChart } from "./analytics-charts";
import styles from "./analytics-dashboard.module.css";

export function AnalyticsDashboard() {
  const { t, locale } = useCopy();
  const [filters, setFilters] = useState<AnalyticsFilters>(defaultAnalyticsFilters);
  const [mode, setMode] = useState<AnalyticsPeriod>("month");
  const [draft, setDraft] = useState({ from: "", to: "" });
  const [interval, setInterval] = useState<AnalyticsInterval>("day");
  const [cumulative, setCumulative] = useState(false);
  const [sessionPage, setSessionPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [groupPage, setGroupPage] = useState(1);
  const query = analyticsParams(filters);
  const load = useCallback(() => analyticsService.summary(query, interval), [query, interval]);
  const summary = useRemote(load);
  const loadSessions = useCallback(() => analyticsService.sessions(query, sessionPage), [query, sessionPage]);
  const sessions = useRemote(loadSessions);
  const loadAlerts = useCallback(() => analyticsService.alerts(filters.groupId, alertPage), [filters.groupId, alertPage]);
  const alerts = useRemote(loadAlerts);
  const data = !summary.loading && !summary.error ? summary.data : undefined;
  const currentSessions = !sessions.loading && !sessions.error ? sessions.data : undefined;
  const currentAlerts = !alerts.loading && !alerts.error ? alerts.data : undefined;
  const groups = (data?.groups ?? []).filter(group => !filters.groupId || group.id === filters.groupId);
  function update(patch: Partial<AnalyticsFilters>) {
    setFilters(previous => ({ ...previous, ...patch })); setSessionPage(1); setGroupPage(1);
    if (patch.groupId !== undefined) setAlertPage(1);
  }
  const counts = data?.kpis;
  const number = (value?: number) => value === undefined ? "—" : value.toLocaleString(locale);
  const cards = [
    { name: "Utilisateurs actuels", value: number(counts?.users), Icon: Users, scope: "Effectifs actuels", detail: counts ? t("{approved} approuvés · {pending} en attente", { approved: counts.approved, pending: counts.pendingUsers }) : "" },
    { name: "Groupes actuels", value: number(counts?.groups), Icon: Layers, scope: "Effectifs actuels", detail: t(filters.groupId ? "Groupe sélectionné" : "Tous les groupes") },
    { name: "Séances effectuées", value: number(counts?.sessions), Icon: CalendarDays, scope: "Sur la période", detail: t("Toutes les fins de créneau sont passées") },
    { name: "Présences enregistrées", value: number(counts?.present), Icon: CheckCheck, scope: "Sur la période", detail: t("Un étudiant présent à une séance = une présence") },
    { name: "Taux de présence global", value: counts?.rate == null ? "—" : `${number(counts.rate)} %`, Icon: Percent, scope: "Sur la période", detail: counts ? t("{present} présences · {absent} absences confirmées", { present: counts.present, absent: counts.absent }) : "" },
  ];
  return <div className={`admin-page ${styles.dashboard}`}>
    <header className={styles.heading}><div><span className="eyebrow">{t("CHTAW TEAM · ANALYSES")}</span><h1>{t("Tableau de bord")}</h1><p>{t("Les chiffres pour accompagner votre collectif.")}</p></div>
      <Button variant="secondary" onClick={() => { summary.refresh(); sessions.refresh(); alerts.refresh(); }}><RotateCcw size={15} aria-hidden="true" />{t("Actualiser")}</Button>
    </header>
    <section className={styles.filters} aria-label={t("Filtres du tableau de bord")}>
      <label>{t("Période")}<select aria-label={t("Période")} value={mode} onChange={event => {
        const value = event.target.value as AnalyticsPeriod; setMode(value);
        if (value !== "custom") update({ period: value });
        else setDraft({ from: summary.data?.period.from ?? "", to: summary.data?.period.to ?? "" });
      }}>{[["week", "Cette semaine"], ["month", "Ce mois"], ["quarter", "Trois derniers mois"], ["year", "Cette année"], ["custom", "Période personnalisée"]].map(([value, label]) => <option key={value} value={value}>{t(label!)}</option>)}</select></label>
      <label>{t("Groupe")}<select aria-label={t("Groupe")} value={filters.groupId} onChange={event => update({ groupId: event.target.value })}><option value="">{t("Tous les groupes")}</option>{summary.data?.groups.map(group => <option value={group.id} key={group.id}>{group.name}</option>)}</select></label>
      <Button variant="ghost" onClick={() => { setMode("month"); setDraft({ from: "", to: "" }); setInterval("day"); setCumulative(false); update(defaultAnalyticsFilters); }}><RotateCcw size={15} aria-hidden="true" />{t("Réinitialiser")}</Button>
      {mode === "custom" && <form className={styles.customPeriod} onSubmit={event => { event.preventDefault(); if (draft.from && draft.to && draft.from <= draft.to) update({ period: "custom", ...draft }); }}>
        <label>{t("Date de début")}<input type="date" required value={draft.from} onChange={event => setDraft(previous => ({ ...previous, from: event.target.value }))} /></label>
        <label>{t("Date de fin")}<input type="date" required min={draft.from} value={draft.to} onChange={event => setDraft(previous => ({ ...previous, to: event.target.value }))} /></label>
        <Button type="submit" variant="secondary" disabled={!draft.from || !draft.to || draft.from > draft.to}>{t("Appliquer")}</Button>
      </form>}
    </section>
    <p className={styles.scope}>{summary.data ? `${dashboardDate(summary.data.period.from, locale)} – ${dashboardDate(summary.data.period.to, locale)} · ${summary.data.period.timeZone}` : t("Chargement de la période…")}<br />{t("La période filtre les inscriptions et les séances terminées, selon leur premier créneau. Les effectifs et les groupes sont actuels. Les signalements portent sur tout l’historique.")}</p>
    <LoadState {...summary} retry={summary.refresh} />
    <section className={styles.kpis} aria-label={t("Indicateurs clés")} aria-busy={summary.loading}>
      {cards.map(({ name, value, Icon, scope, detail }) => <article className={styles.kpi} key={name}><div className={styles.kpiTop}><span>{t(scope)}</span><Icon size={18} aria-hidden="true" /></div><h2>{t(name)}</h2><strong>{value}</strong><p>{detail || t("En attente des données")}</p></article>)}
    </section>
    <section className={styles.panel} aria-labelledby="registration-heading">
      <div className={styles.panelHeading}><div><span className={styles.sectionIcon}><TrendingUp size={17} aria-hidden="true" /></span><h2 id="registration-heading">{t("Évolution des inscriptions")}</h2></div>
        <div className={styles.chartControls}><label className="sr-only" htmlFor="analytics-interval">{t("Regrouper les inscriptions")}</label><select id="analytics-interval" value={interval} onChange={event => setInterval(event.target.value as AnalyticsInterval)}>{[["day", "Par jour"], ["week", "Par semaine"], ["month", "Par mois"]].map(([value, label]) => <option value={value} key={value}>{t(label!)}</option>)}</select>
          <div className={styles.toggle} aria-label={t("Mode des inscriptions")}><button type="button" aria-pressed={!cumulative} onClick={() => setCumulative(false)}>{t("Nouvelles")}</button><button type="button" aria-pressed={cumulative} onClick={() => setCumulative(true)}>{t("Cumulées")}</button></div>
        </div>
      </div>
      <p className={styles.note}>{t("Comptes conservés, selon leur date réelle d’inscription. Le cumul inclut les dates antérieures à la période. Les comptes définitivement supprimés ne peuvent pas être reconstitués.")} {t("Le filtre de groupe utilise les membres actuels, sans historique d’adhésion.")}</p>
      {data ? <RegistrationChart buckets={data.registrations} cumulative={cumulative} /> : <div className={styles.chartPlaceholder} aria-hidden="true" />}
    </section>
    <div className={styles.comparisons}>
      <section className={styles.panel} aria-labelledby="group-analysis-heading">
        <div className={styles.panelHeading}><div><h2 id="group-analysis-heading">{t("Présences par groupe")}</h2></div><span className={styles.pill}>{t("{count} groupe(s)", { count: groups.length })}</span></div>
        <AttendanceLegend />
        <p className={styles.note}>{t("Cliquez sur un groupe pour filtrer les analyses. Une séance partagée et ses participations figurent dans chaque groupe lié : ces totaux ne s’additionnent pas.")}</p>
        <div className={styles.barList}>{groups.slice((groupPage - 1) * 6, groupPage * 6).map(group => <ComparisonRow key={group.id} name={group.name} counts={group} members={group.members} max={Math.max(1, ...groups.flatMap(item => [item.present, item.absent]))} onClick={() => update({ groupId: group.id })} />)}</div>
        {data && !groups.length && <p className={styles.empty}>{t("Aucun groupe dans ce périmètre.")}</p>}
        <AnalyticsPagination page={groupPage} total={groups.length} limit={6} change={setGroupPage} />
      </section>
      <section className={styles.panel} aria-labelledby="session-analysis-heading">
        <div className={styles.panelHeading}><div><h2 id="session-analysis-heading">{t("Présences par séance")}</h2></div><span className={styles.pill}>{t("{count} séance(s)", { count: sessions.data?.total ?? 0 })}</span></div>
        <AttendanceLegend /><p className={styles.note}>{t("Séances terminées uniquement. Cliquez pour ouvrir le détail de présence.")}</p>
        <LoadState {...sessions} retry={sessions.refresh} />
        <div className={styles.barList}>{currentSessions?.items.map(session => <ComparisonRow key={session.id} name={session.name} subtitle={dashboardDate(session.date, locale)} counts={session} max={Math.max(1, ...currentSessions.items.flatMap(item => [item.present, item.absent]))} href={attendanceSessionHref(session.id)} />)}</div>
        {currentSessions && !currentSessions.items.length && <p className={styles.empty}>{t("Aucune séance terminée sur cette période.")}</p>}
        <AnalyticsPagination page={sessionPage} total={sessions.data?.total ?? 0} limit={8} change={setSessionPage} busy={sessions.loading} />
      </section>
    </div>
    <p className={styles.method}>{t("Le taux = présences ÷ (présences + absences confirmées). Un vote ne vaut pas présence. Les pointages incomplets sont exclus du taux.")} {counts ? t("{count} pointage(s) incomplet(s) sur la période.", { count: counts.pending }) : ""}</p>
    <section className={styles.panel} aria-labelledby="active-alerts-heading">
      <div className={styles.panelHeading}><div><span className={styles.sectionIcon}><ShieldAlert size={18} aria-hidden="true" /></span><h2 id="active-alerts-heading">{t("Signalements actifs")}</h2></div><span className={styles.pill}>{alerts.data?.total ?? "—"}</span></div>
      <p className={styles.note}>{t("Seuil existant de trois absences par organisateur, sur tout l’historique. Seul le filtre de groupe s’applique à cette liste.")}</p>
      <LoadState {...alerts} retry={alerts.refresh} />
      {currentAlerts && (currentAlerts.items.length ? <div className={`table-wrap request-table ${styles.alertTable}`}><table><caption className="sr-only">{t("Signalements actifs")}</caption><thead><tr>{["Étudiant", "Groupes concernés", "Absences", "Détail"].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead>
        <tbody>{currentAlerts.items.map(alert => <tr key={alert.id}><td data-label={t("Étudiant")}><strong>{alert.student}</strong><small>{t("Suivi par {name}", { name: alert.organizer })}</small></td><td data-label={t("Groupes concernés")}>{alert.groups.join(", ")}</td><td data-label={t("Absences")}><span className={styles.alertCount}>{alert.absences}</span></td><td data-label={t("Détail")}><Button asChild size="sm" variant="secondary"><Link href={`/admin/collaborator-reports?alert=${encodeURIComponent(alert.id)}`}>{t("Voir le détail")}</Link></Button></td></tr>)}</tbody>
      </table></div> : <p className={styles.empty}>{t("Aucun signalement actif dans ce périmètre.")}</p>)}
      <AnalyticsPagination page={alertPage} total={alerts.data?.total ?? 0} limit={5} change={setAlertPage} busy={alerts.loading} />
    </section>
  </div>;
}
