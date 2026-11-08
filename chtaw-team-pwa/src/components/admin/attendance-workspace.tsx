"use client";
import { useCopy, currentLanguage } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { attendanceSessionHref } from "@/features/attendance-navigation";
import { ClipboardCheck, Bell, History, RefreshCw } from "lucide-react";
import { useCommunity } from "@/stores/community";
import {
  attendanceService,
  type AttendanceReport,
  type AttendanceSession,
} from "@/services/attendance.service";
import {
  AttendanceDashboard,
  AttendanceHistory,
  AttendanceBadge,
  LoadState,
  useRemote,
} from "./attendance-panel";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Empty, attempt } from "@/components/shared";

const phaseLabels: Record<string, string> = {
  UPCOMING: "À venir",
  ONGOING: "En cours",
  FINISHED: "Terminée",
  CANCELLED: "Annulée",
  LEGACY: "Suivi historique",
};
const date = (value: string) =>
  new Date(value).toLocaleString(currentLanguage() === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AttendanceWorkspace({ initialPollId = "" }: { initialPollId?: string }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [tab, setTab] = useState("pointage");
  const [filters, setFilters] = useState<Record<string, string>>({
    page: "1",
    phase: "",
    reportStatus: "ACTIVE",
    pollId: initialPollId,
  });
  const serialized = JSON.stringify(filters);
  const load = useCallback(
    async () => ({
      kind: tab,
      ...(tab === "history"
        ? { items: [], total: 0 }
        : tab === "reports"
          ? await attendanceService.reports(JSON.parse(serialized))
          : await attendanceService.sessions(JSON.parse(serialized))),
    }),
    [serialized, tab],
  );
  const remote = useRemote<{
    kind: string;
    items: (AttendanceSession | AttendanceReport)[];
    total: number;
  }>(load);
  const data = remote.data?.kind === tab ? remote.data : undefined;
  const [history, setHistory] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [decision, setDecision] = useState<{
    report: AttendanceReport;
    action: "ABSENT" | "PRESENT";
  } | null>(null);
  const [slotId, setSlotId] = useState("");
  const [saving, setSaving] = useState(false);
  const update = (patch: Record<string, string>) =>
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? "1" }));
  const refresh = remote.refresh;
  useEffect(() => {
    if (tab === "history") return;
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh, tab]);
  const reload = () => {
    refresh();
    setRevision((r) => r + 1);
  };
  const sessions =
    tab === "pointage" ? (data?.items as AttendanceSession[] | undefined) : undefined;
  const reports = tab === "reports" ? (data?.items as AttendanceReport[] | undefined) : undefined;
  return (
    <>
      <header className="page-heading">
        <div>
          <span className="eyebrow"> {copy("ESPACE ADMIN · SUIVI DES ÉTUDIANTS")} </span>
          <h1> {copy("Gestion des présences")} </h1>
          <p className="muted">
            {copy("Suivez les séances, effectuez les pointages et gérez les absences.")}{" "}
          </p>
        </div>
      </header>
      <nav className="activity-navigation" aria-label={copy("Navigation des présences")}>
        {[
          { id: "pointage", title: "Pointage", Icon: ClipboardCheck },
          { id: "reports", title: "Signalements", Icon: Bell },
          { id: "history", title: "Historique et absences", Icon: History },
        ].map(({ id, title, Icon }) => (
          <Button
            key={id}
            variant={tab === id ? "default" : "ghost"}
            aria-pressed={tab === id}
            onClick={() => {
              setTab(id);
              update({ page: "1" });
            }}
          >
            <Icon size={16} aria-hidden="true" />
            {copy(title)}
          </Button>
        ))}
      </nav>
      {tab === "history" ? (
        <AttendanceDashboard key={revision} />
      ) : (
        <section
          className="panel attendance-workspace-panel"
          aria-label={
            tab === "reports" ? copy("Signalements de fin de séance") : copy("Séances à pointer")
          }
        >
          <div className="row between wrap">
            <h2>
              {tab === "reports" ? copy("Signalements à vérifier") : copy("Séances et créneaux")}
            </h2>
            <Button variant="ghost" size="sm" disabled={remote.loading} onClick={reload}>
              <RefreshCw size={15} aria-hidden="true" />
              {copy("Actualiser")}{" "}
            </Button>
          </div>
          <p className="small muted">
            {tab === "reports"
              ? "Après la fin du dernier créneau, les étudiants sans présence sont signalés. Seule votre confirmation ajoute une absence au compteur."
              : copy(
                  "Les nouvelles séances incluent les étudiants approuvés du groupe au moment de la création. Le vote indique une préférence, jamais une présence.",
                )}
          </p>
          <div className="request-filters">
            <label>
              {copy("Groupe")}{" "}
              <select
                value={filters.groupId ?? ""}
                onChange={(e) => update({ groupId: e.target.value, pollId: "" })}
              >
                <option value=""> {copy("Tous les groupes")} </option>
                {store.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {copy("Séance")}{" "}
              <select
                value={filters.pollId ?? ""}
                onChange={(e) => update({ pollId: e.target.value })}
              >
                <option value=""> {copy("Toutes les séances")} </option>
                {store.polls
                  .filter(
                    (p) =>
                      p.type === "SESSION" && (!filters.groupId || p.groupId === filters.groupId),
                  )
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.question}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {copy("Date de début")}{" "}
              <input
                type="date"
                value={filters.from ?? ""}
                onChange={(e) => update({ from: e.target.value })}
              />
            </label>
            <label>
              {copy("Date de fin")}{" "}
              <input
                type="date"
                value={filters.to ?? ""}
                onChange={(e) => update({ to: e.target.value })}
              />
            </label>
            {tab === "pointage" ? (
              <label>
                {copy("Statut")}{" "}
                <select value={filters.phase} onChange={(e) => update({ phase: e.target.value })}>
                  <option value=""> {copy("Tous les statuts")} </option>
                  {Object.entries(phaseLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {copy(label)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                <label>
                  {copy("Étudiant")}{" "}
                  <input
                    type="search"
                    maxLength={254}
                    placeholder={copy("Nom ou email…")}
                    value={filters.search ?? ""}
                    onChange={(e) => update({ search: e.target.value })}
                  />
                </label>
                <label>
                  {copy("Signalement")}{" "}
                  <select
                    value={filters.reportStatus}
                    onChange={(e) => update({ reportStatus: e.target.value })}
                  >
                    <option value="ACTIVE"> {copy("Actifs")} </option>
                    <option value="RESOLVED"> {copy("Résolus")} </option>
                    <option value="ALL"> {copy("Tous")} </option>
                  </select>
                </label>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters({ page: "1", phase: "", reportStatus: "ACTIVE" })}
            >
              {copy("Réinitialiser")}{" "}
            </Button>
          </div>
          <p className="tiny muted">
            {copy(
              "Les dates filtrent les créneaux (journées UTC). Les horaires sont affichés dans votre heure locale.",
            )}{" "}
          </p>
          <LoadState {...remote} retry={reload} />
          <div className="activity-list" aria-busy={remote.loading}>
            {sessions?.map((session) => (
              <article className="activity-card" key={session.id}>
                <div className="activity-card-main">
                  <div className="row wrap between">
                    <h3>{session.question}</h3>
                    <span className="activity-status">
                      {copy(phaseLabels[session.phase] ?? session.phase)}
                    </span>
                  </div>
                  <p className="small muted">{session.group.name}</p>
                  <ul className="activity-schedule">
                    {session.options.map((option) => (
                      <li key={option.id}>
                        {option.label} ·{" "}
                        {option.startsAt ? date(option.startsAt) : copy("Horaire non renseigné")}
                        {option.endsAt ? ` → ${date(option.endsAt)}` : ""}
                      </li>
                    ))}
                  </ul>
                  <p className="small">
                    {session.concerned} {copy("concernés ·")} {session.present} {copy("présents ·")}{" "}
                    {session.toVerify} {copy("à vérifier")}{" "}
                  </p>
                  {!session.mandatoryAttendance && (
                    <p className="tiny muted">
                      {copy(
                        "Ancienne séance : fonctionnement par votes conservé, sans conversion automatique.",
                      )}{" "}
                    </p>
                  )}
                </div>
                <Button asChild size="sm">
                  <Link href={attendanceSessionHref(session.id)}>
                    {" "}
                    {copy("Gérer les présences")}{" "}
                  </Link>
                </Button>
              </article>
            ))}
            {reports?.map((report) => (
              <article
                className="attendance-history-card"
                key={`${report.pollId}:${report.user.id}`}
              >
                <div className="row between wrap">
                  <h3>
                    {report.user.firstName} {report.user.lastName}
                  </h3>
                  <span
                    className={`badge attendance-badge ${report.resolvedAt ? "attendance-non_verifie" : "attendance-a_verifier"}`}
                  >
                    {report.resolvedAt ? copy("Résolu") : copy("À vérifier")}
                  </span>
                </div>
                <p className="small">
                  {report.group.name} · {report.question}
                </p>
                <p className="tiny muted">
                  {report.user.email} {copy("· Fin de séance :")} {date(report.lastEnd)}
                </p>
                <div className="attendance-report-slots">
                  {report.options.map((option) => (
                    <div key={option.id}>
                      <strong>{option.label}</strong>
                      <span>
                        {option.startsAt ? date(option.startsAt) : ""}
                        {option.endsAt ? ` → ${date(option.endsAt)}` : ""}
                      </span>
                      <span>
                        {report.votedOptionIds.includes(option.id)
                          ? copy("A voté pour ce créneau")
                          : copy("N’a pas voté pour ce créneau")}
                      </span>
                      <AttendanceBadge
                        value={
                          report.marks.find((m) => m.optionId === option.id)?.attendance ??
                          "NON_VERIFIE"
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="row wrap">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={remote.loading || saving || !!report.resolvedAt}
                    onClick={() => setDecision({ report, action: "ABSENT" })}
                  >
                    {copy("Confirmer l’absence")}{" "}
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      remote.loading ||
                      saving ||
                      report.final === "ANNULE" ||
                      report.final === "NON_CONCERNE"
                    }
                    onClick={() => {
                      setDecision({ report, action: "PRESENT" });
                      setSlotId("");
                    }}
                  >
                    {copy("Marquer présent")}{" "}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setHistory(report.user.id)}>
                    {copy("Consulter l’historique")}{" "}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          {!remote.loading && !remote.error && data?.total === 0 && (
            <Empty
              title={
                tab === "reports"
                  ? copy("Aucun signalement avec ces filtres")
                  : copy("Aucune séance avec ces filtres")
              }
            >
              {tab === "reports"
                ? copy(
                    "Les signalements apparaissent uniquement après la fin du dernier créneau. Une présence confirmée ou une absence validée résout le signalement.",
                  )
                : copy("Créez une séance depuis Séances & Sondages ou ajustez les filtres.")}
            </Empty>
          )}
          {data && data.total > 0 && (
            <nav
              className="row between wrap request-pagination"
              aria-label={copy("Pagination du suivi")}
            >
              <Button
                size="sm"
                variant="secondary"
                disabled={remote.loading || +filters.page <= 1}
                onClick={() => update({ page: String(+filters.page - 1) })}
              >
                {copy("Précédent")}{" "}
              </Button>
              <span className="tiny">
                {copy("Page")} {filters.page} {copy("sur")}{" "}
                {Math.max(1, Math.ceil(data.total / 20))}
              </span>
              <Button
                size="sm"
                variant="secondary"
                disabled={remote.loading || +filters.page * 20 >= data.total}
                onClick={() => update({ page: String(+filters.page + 1) })}
              >
                {copy("Suivant")}{" "}
              </Button>
            </nav>
          )}
        </section>
      )}
      {history && (
        <AttendanceHistory
          userId={history}
          onClose={() => {
            setHistory(null);
            reload();
          }}
        />
      )}
      {decision && (
        <Modal
          open
          title={
            decision.action === "ABSENT"
              ? copy("Confirmer une absence")
              : copy("Enregistrer une présence oubliée")
          }
          onClose={() => {
            if (!saving) setDecision(null);
          }}
        >
          <form
            className="form-stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (saving) return;
              setSaving(true);
              try {
                const ok = await attempt(
                  async () => {
                    if (decision.action === "ABSENT")
                      await attendanceService.confirmAbsence(
                        decision.report.pollId,
                        decision.report.user.id,
                        decision.report.version,
                      );
                    else {
                      const row = await attendanceService.roster(decision.report.pollId);
                      const slot = row.slots.find((s) => s.id === slotId);
                      const student = slot?.students.find(
                        (s) => s.user.id === decision.report.user.id,
                      );
                      if (
                        !slot ||
                        !student ||
                        student.participantVersion !== decision.report.version
                      )
                        throw Error(
                          copy("Le signalement a changé. Actualisez la liste avant de réessayer."),
                        );
                      await attendanceService.save(row.id, [
                        {
                          userId: student.user.id,
                          optionId: slot.id,
                          status: "PRESENT",
                          version: student.version,
                          participantVersion: student.participantVersion,
                        },
                      ]);
                    }
                  },
                  decision.action === "ABSENT"
                    ? copy("Absence confirmée et compteur recalculé")
                    : copy("Présence enregistrée et compteur recalculé"),
                );
                if (ok) setDecision(null);
                reload();
              } finally {
                setSaving(false);
              }
            }}
          >
            <p>
              {decision.report.user.firstName} {decision.report.user.lastName} ·{" "}
              {decision.report.question}
            </p>
            <p className="small muted">
              {decision.action === "ABSENT"
                ? copy(
                    "Cette décision ajoutera une seule absence pour cette séance. Vous pourrez la corriger ultérieurement depuis l’historique.",
                  )
                : copy(
                    "Choisissez le créneau réellement suivi. Cette présence annulera l’effet d’une éventuelle absence confirmée pour la séance.",
                  )}
            </p>
            {decision.action === "PRESENT" && (
              <label>
                {copy("Créneau réel")}{" "}
                <select
                  required
                  value={slotId}
                  disabled={saving}
                  onChange={(e) => setSlotId(e.target.value)}
                >
                  <option value=""> {copy("Choisir le créneau")} </option>
                  {decision.report.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label} · {o.startsAt ? date(o.startsAt) : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="row wrap">
              <Button
                type="button"
                variant="secondary"
                disabled={saving}
                onClick={() => setDecision(null)}
              >
                {copy("Annuler")}{" "}
              </Button>
              <Button type="submit" disabled={saving || (decision.action === "PRESENT" && !slotId)}>
                {saving ? copy("Enregistrement…") : copy("Confirmer")}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
