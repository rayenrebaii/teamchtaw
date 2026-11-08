"use client";
import { useCopy, currentLanguage } from "@/lib/i18n";
import { useCallback, useEffect, useState } from "react";
import { attendanceSlotStarted } from "@/features/attendance-time";
import Link from "next/link";
import { ArrowLeft, CalendarDays, RefreshCw, Save, Search } from "lucide-react";
import {
  attendanceService,
  type AttendanceEntry,
  type AttendanceStatus,
  type Roster,
} from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { useUnsavedAttendance } from "@/hooks/use-unsaved-attendance";
import { attendanceRosterSummary, attendanceReturnHref } from "@/features/attendance-navigation";
import { attendanceLabels, visibleAttendanceStudents } from "@/features/session-polls";
import { Button } from "@/components/ui/button";
import { Empty, attempt } from "@/components/shared";
import { AttendanceBadge, LoadState, useRemote } from "./attendance-panel";

type Student = Roster["slots"][number]["students"][number];
const formatDate = (value: string) =>
  new Date(value).toLocaleString(currentLanguage() === "en" ? "en-GB" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AttendanceRosterPage({
  pollId,
  initialSlotId,
}: {
  pollId: string;
  initialSlotId?: string;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const load = useCallback(() => attendanceService.roster(pollId), [pollId]);
  const remote = useRemote(load);
  const [slotId, setSlotId] = useState(initialSlotId ?? "");
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, AttendanceEntry>>({});
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 1000);
    window.addEventListener("focus", update);
    return () => { clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  const [showPresent, setShowPresent] = useState(false);
  const [enrollment, setEnrollment] = useState("ALL");
  const [addId, setAddId] = useState("");
  const [participantAction, setParticipantAction] = useState<{
    userId: string;
    included: boolean;
    version: number;
  } | null>(null);
  const data = remote.data;
  const slot = data?.slots.find((s) => s.id === slotId) ?? data?.slots[0];
  const slotStarted = attendanceSlotStarted(slot?.startsAt, now);
  const invalidDrafts = Object.values(drafts).some((draft) => !attendanceSlotStarted(data?.slots.find((candidate) => candidate.id === draft.optionId)?.startsAt, now));
  const students = visibleAttendanceStudents(
    slot?.students ?? [],
    search,
    enrollment,
    showPresent,
    !!data?.mandatoryAttendance,
  );
  const dirtyCount = Object.keys(drafts).length;
  useUnsavedAttendance(dirtyCount > 0 || saving, slot?.id ?? "");
  const refresh = () => {
    setDrafts({});
    remote.refresh();
  };
  const requestRefresh = () => {
    if (
      !dirtyCount ||
      window.confirm(copy("Actualiser la liste et abandonner les modifications non enregistrées ?"))
    )
      refresh();
  };
  const selectSlot = (id: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("slot", id);
    window.history.replaceState(window.history.state, "", url);
    setSlotId(id);
  };
  const mark = (student: Student, status: AttendanceStatus) => {
    if (!slot || !attendanceSlotStarted(slot.startsAt) || saving || remote.loading || data?.status === "CANCELLED") return;
    const key = `${student.user.id}:${slot.id}`;
    setDrafts((current) => {
      const next = { ...current };
      if (status === student.attendance) delete next[key];
      else
        next[key] = {
          userId: student.user.id,
          optionId: slot.id,
          status,
          version: student.version,
          participantVersion: student.participantVersion,
        };
      return next;
    });
  };
  const save = async () => {
    if (saving || remote.loading || !dirtyCount || invalidDrafts || data?.status === "CANCELLED") return;
    setSaving(true);
    try {
      const ok = await attempt(
        () => attendanceService.save(pollId, Object.values(drafts)),
        copy("Présences enregistrées et totaux recalculés"),
      );
      if (ok) refresh();
    } finally {
      setSaving(false);
    }
  };
  const summary = data ? attendanceRosterSummary(data) : null;
  const dates =
    data?.slots
      .flatMap((s) => [s.startsAt, ...(s.endsAt ? [s.endsAt] : [])])
      .sort((a, b) => Date.parse(a) - Date.parse(b)) ?? [];
  const disabled = saving || remote.loading || data?.status === "CANCELLED";
  return (
    <section className="attendance-roster" aria-label={copy("Page de pointage de la séance")}>
      <Link className="roster-back" href={attendanceReturnHref(pollId)}>
        <ArrowLeft size={17} aria-hidden="true" />
        {copy("Retour aux présences")}{" "}
      </Link>
      <header className="roster-heading">
        <div>
          <span className="eyebrow"> {copy("POINTAGE DES PRÉSENCES")} </span>
          <h1>{data?.question ?? copy("Pointage de la séance")}</h1>
          {data && <p className="muted">{data.group.name}</p>}
          {dates.length > 0 && (
            <p className="roster-date">
              <CalendarDays size={16} aria-hidden="true" />
              <span>
                {formatDate(dates[0])}
                {dates.length > 1 && dates[dates.length - 1] !== dates[0]
                  ? ` → ${formatDate(dates[dates.length - 1])}`
                  : ""}
              </span>
            </p>
          )}
        </div>
        {data && (
          <span className={`activity-status status-${data.status.toLowerCase()}`}>
            {data.status === "CANCELLED"
              ? copy("Séance annulée")
              : data.finished
                ? copy("Séance terminée")
                : data.status === "CLOSED"
                  ? copy("Inscriptions closes")
                  : copy("Séance ouverte")}
          </span>
        )}
      </header>
      <LoadState {...remote} retry={requestRefresh} />
      {!data && remote.loading && (
        <div className="roster-loading" aria-hidden="true">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      )}
      {data && (
        <>
          <div className="roster-stats" aria-label={copy("Bilan enregistré de la séance")}>
            {[
              { label: "Étudiants concernés", value: summary!.concerned },
              { label: "Présents", value: summary!.present },
              { label: "Absences confirmées", value: summary!.absent },
              { label: "À vérifier", value: summary!.pending },
            ].map((stat) => (
              <div key={copy(stat.label)}>
                <span>{copy(stat.label)}</span>
                <strong>{stat.value}</strong>
              </div>
            ))}
          </div>
          {data.status === "CANCELLED" && (
            <p className="roster-notice" role="status">
              {copy(
                "Séance annulée : pointages en consultation uniquement, absences exclues des compteurs cumulés.",
              )}{" "}
            </p>
          )}
          <section className="panel roster-content" aria-label={copy("Pointage par créneau")}>
            {slot && !slotStarted && <p className="roster-notice" role="status">{copy("Le pointage est disponible uniquement à partir de l’heure de début du créneau.")} {slot.startsAt && formatDate(slot.startsAt)}</p>}
            <div className="roster-section-heading">
              <h2> {copy("Choisir un créneau")} </h2>
              <span className="tiny muted">
                {data.slots.length} {copy("créneau")} {data.slots.length > 1 ? "x" : ""}
              </span>
            </div>
            <div
              className="attendance-slot-tabs roster-slot-tabs"
              role="group"
              aria-label={copy("Choisir le créneau à pointer")}
            >
              {data.slots.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  aria-pressed={slot?.id === s.id}
                  onClick={() => selectSlot(s.id)}
                >
                  <strong>{s.label}</strong>
                  <span>
                    {formatDate(s.startsAt)}
                    {s.endsAt ? ` → ${formatDate(s.endsAt)}` : ""}
                  </span>
                </button>
              ))}
            </div>
            <div className="roster-filters">
              <label className="roster-search">
                {copy("Rechercher un étudiant")}{" "}
                <span className="request-search-input">
                  <Search size={17} aria-hidden="true" />
                  <input
                    type="search"
                    placeholder={copy("Nom, prénom ou email…")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </span>
              </label>
              <label>
                {copy("Inscription au créneau")}{" "}
                <select
                  value={enrollment}
                  onChange={(e) => setEnrollment(e.target.value)}
                  disabled={!data.mandatoryAttendance}
                >
                  <option value="ALL"> {copy("Tous les étudiants")} </option>
                  <option value="VOTED"> {copy("A voté pour ce créneau")} </option>
                  <option value="NOT_VOTED"> {copy("N’a pas voté pour ce créneau")} </option>
                </select>
              </label>
              <label className="check-label roster-show-present">
                <input
                  type="checkbox"
                  checked={showPresent}
                  onChange={(e) => setShowPresent(e.target.checked)}
                  disabled={!data.mandatoryAttendance}
                />
                {copy("Afficher les étudiants déjà présents")}{" "}
              </label>
            </div>
            <div className="roster-section-heading">
              <h2>{slot?.label ?? copy("Étudiants")}</h2>
              <span className="tiny muted" role="status">
                {students.length} {copy("étudiant")}
                {students.length !== 1 ? "s" : ""} {copy("affiché")}{" "}
                {students.length !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="roster-help">
              {data.mandatoryAttendance
                ? copy(
                    "Les étudiants sans vote peuvent être pointés. Les étudiants présents sur un autre créneau sont masqués par défaut. Les statuts globaux et le bilan affichent les données enregistrées.",
                  )
                : copy(
                    "Séance historique : seuls les étudiants inscrits au créneau sont listés. Les règles de calcul existantes sont conservées.",
                  )}
            </p>
            <div className="roster-table-shell" aria-busy={remote.loading}>
              <table className="roster-table" role="table">
                <caption className="sr-only">
                  {copy("Pointage des étudiants pour")} {slot?.label}
                </caption>
                <colgroup>
                  <col className="roster-col-name" />
                  <col className="roster-col-email" />
                  <col className="roster-col-vote" />
                  <col className="roster-col-global" />
                  <col className="roster-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col"> {copy("Nom et prénom")} </th>
                    <th scope="col"> {copy("Email")} </th>
                    <th scope="col"> {copy("Inscription au créneau")} </th>
                    <th scope="col"> {copy("Statut global")} </th>
                    <th scope="col"> {copy("Pointage du créneau")} </th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  {students.map((student) => {
                    const key = `${student.user.id}:${slot!.id}`;
                    const selected = drafts[key]?.status ?? student.attendance;
                    return (
                      <tr
                        key={key}
                        role="row"
                        className={drafts[key] ? "roster-row-dirty" : undefined}
                      >
                        <td role="cell" data-label={copy("Étudiant")}>
                          <strong>
                            {student.user.firstName} {student.user.lastName}
                          </strong>
                          {drafts[key] && (
                            <span className="roster-draft-label"> {copy("Non enregistré")} </span>
                          )}
                        </td>
                        <td role="cell" data-label={copy("Email")}>
                          {student.user.email}
                        </td>
                        <td role="cell" data-label={copy("Inscription")}>
                          {!data.mandatoryAttendance || student.voted
                            ? copy("A voté pour ce créneau")
                            : student.hasVoted
                              ? copy("A voté pour un autre créneau")
                              : copy("N’a pas voté")}
                        </td>
                        <td role="cell" data-label={copy("Statut global")}>
                          <AttendanceBadge value={student.final} global />
                          <span className="roster-absence-total">
                            {student.absences} {copy("absence")} {student.absences !== 1 ? "s" : ""}{" "}
                            {copy("cumulée")} {student.absences !== 1 ? "s" : ""}
                          </span>
                        </td>
                        <td role="cell" data-label={copy("Pointage")}>
                          <div
                            className="attendance-mark-actions roster-mark-actions"
                            role="group"
                            aria-label={`Pointage de ${student.user.firstName} ${student.user.lastName}`}
                          >
                            {(["PRESENT", "ABSENT", "NON_VERIFIE"] as const).map((status) => (
                              <Button
                                type="button"
                                key={status}
                                size="sm"
                                variant={selected === status ? "default" : "secondary"}
                                aria-pressed={selected === status}
                                disabled={disabled || !slotStarted}
                                onClick={() => mark(student, status)}
                              >
                                {copy(attendanceLabels[status] ?? status)}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!students.length && (
              <Empty title={copy("Aucun étudiant avec ces filtres")}>
                {data.mandatoryAttendance
                  ? copy(
                      "Ajustez la recherche ou l’inscription, ou affichez les étudiants déjà présents pour consulter et corriger leur pointage.",
                    )
                  : copy("Aucun étudiant inscrit ne correspond à votre recherche.")}
              </Empty>
            )}
          </section>
          {data.mandatoryAttendance && (
            <details className="attendance-participants">
              <summary> {copy("Ajuster les étudiants concernés par la séance")} </summary>
              <p className="tiny muted">
                {copy(
                  "La liste a été figée à la création. Les nouveaux membres ne sont ajoutés que sur votre décision ; un retrait du groupe ne supprime pas l’obligation ni l’historique de cette séance.",
                )}{" "}
              </p>
              <div className="row wrap">
                <label>
                  {copy("Ajouter un étudiant approuvé")}{" "}
                  <select
                    value={addId}
                    onChange={(e) => setAddId(e.target.value)}
                    disabled={saving || Object.keys(drafts).length > 0}
                  >
                    <option value=""> {copy("Choisir un étudiant")} </option>
                    {store.users
                      .filter(
                        (u) =>
                          u.role === "USER" &&
                          u.status === "APPROVED" &&
                          store.groups
                            .find((g) => g.id === data!.group.id)
                            ?.memberIds.includes(u.id) &&
                          !data!.participants?.some((p) => p.user.id === u.id && p.included),
                      )
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={
                    !addId ||
                    saving ||
                    Object.keys(drafts).length > 0 ||
                    data.status === "CANCELLED"
                  }
                  onClick={() =>
                    setParticipantAction({
                      userId: addId,
                      included: true,
                      version: data!.participants?.find((p) => p.user.id === addId)?.version ?? 0,
                    })
                  }
                >
                  {copy("Ajouter à la séance")}{" "}
                </Button>
              </div>
              <div className="group-member-options">
                {data.participants
                  ?.filter((p) => p.included)
                  .map((p) => (
                    <div key={p.user.id} className="row between membership-row">
                      <span>
                        {p.user.firstName} {p.user.lastName}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          saving || Object.keys(drafts).length > 0 || data!.status === "CANCELLED"
                        }
                        onClick={() =>
                          setParticipantAction({
                            userId: p.user.id,
                            included: false,
                            version: p.version,
                          })
                        }
                      >
                        {copy("Retirer de cette séance")}{" "}
                      </Button>
                    </div>
                  ))}
              </div>
              {participantAction && (
                <div className="attendance-confirmation" role="alert">
                  <p>
                    {participantAction.included
                      ? copy("Ajouter cet étudiant aux obligations de cette séance ?")
                      : copy(
                          "Retirer cet étudiant de cette séance ? Ses pointages resteront historisés et son compteur sera recalculé.",
                        )}
                  </p>
                  <div className="row wrap">
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => setParticipantAction(null)}
                    >
                      {copy("Annuler")}{" "}
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const ok = await attempt(
                            () =>
                              attendanceService.participant(
                                pollId,
                                participantAction.userId,
                                participantAction.included,
                                participantAction.version,
                              ),
                            copy("Participants mis à jour"),
                          );
                          if (ok) {
                            setParticipantAction(null);
                            setAddId("");
                            refresh();
                          }
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      {copy("Confirmer")}{" "}
                    </Button>
                  </div>
                </div>
              )}
            </details>
          )}
          <footer className="roster-save-bar" aria-label={copy("Enregistrement des présences")}>
            <div role="status" aria-live="polite">
              <strong>
                {dirtyCount
                  ? `${dirtyCount} modification${dirtyCount > 1 ? "s" : ""} non enregistrée${dirtyCount > 1 ? "s" : ""}`
                  : copy("Aucune modification en attente")}
              </strong>
              <span>
                {" "}
                {copy("Les changements des différents créneaux sont enregistrés ensemble.")}{" "}
              </span>
            </div>
            <div className="row wrap">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                aria-label={copy("Actualiser la liste")}
                disabled={saving || remote.loading}
                onClick={requestRefresh}
              >
                <RefreshCw size={16} aria-hidden="true" />
                <span className="roster-refresh-label"> {copy("Actualiser")} </span>
              </Button>
              <Button type="button" disabled={disabled || !dirtyCount || invalidDrafts} onClick={() => void save()}>
                <Save size={16} aria-hidden="true" />
                {saving ? copy("Enregistrement…") : copy("Enregistrer les présences")}
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );
}
