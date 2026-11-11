"use client";
import { DeleteContent } from "@/components/delete-content";
import { useCopy, currentLanguage } from "@/lib/i18n";
import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { attendanceSessionHref } from "@/features/attendance-navigation";
import {
  CalendarDays,
  ChartNoAxesColumn,
  ClipboardCheck,
  Search,
  Users,
  Clock3,
  Plus,
  RotateCcw,
  ArrowLeft,
} from "lucide-react";
import { attendanceService, type SessionInput } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Empty, attempt } from "@/components/shared";
import { PollCard } from "@/components/polls/poll-card";
import { PublishDialog } from "@/components/chat/publish-dialogs";
import {
  activityStatus,
  defaultActivityFilters,
  filterActivities,
  attendanceLabels,
  localDateTime,
  type ActivityFilters,
} from "@/features/session-polls";
import type { Poll } from "@/types";
import { PollVoteResults } from "./poll-vote-results";
import { SessionManagement } from "./session-management";

export function useRemote<T>(load: () => Promise<T>) {
  const [result, setResult] = useState<{
    load: () => Promise<T>;
    revision: number;
    data?: T;
    error: string;
  }>();
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  useEffect(() => {
    let active = true;
    load()
      .then((data) => {
        if (active) setResult({ load, revision, data, error: "" });
      })
      .catch((e: unknown) => {
        if (active)
          setResult((previous) => ({
            load,
            revision,
            data: previous?.data,
            error: e instanceof Error ? e.message : "Chargement impossible.",
          }));
      });
    return () => {
      active = false;
    };
  }, [load, revision]);
  const current = result?.load === load && result.revision === revision;
  return {
    data: result?.data,
    error: current ? result.error : "",
    loading: !current,
    refresh,
  };
}
export function LoadState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  const { text: copy, error: failure } = useCopy();
  return (
    <>
      {loading && <p role="status"> {copy("Chargement…")} </p>}
      {error && (
        <p className="error" role="alert">
          {failure(error)}{" "}
          <Button size="sm" onClick={retry}>
            {copy("Réessayer")}{" "}
          </Button>
        </p>
      )}
    </>
  );
}
export function AttendanceBadge({ value, global = false }: { value: string; global?: boolean }) {
  const { text: copy } = useCopy();
  return (
    <span className={`badge attendance-badge attendance-${value.toLowerCase()}`}>
      {global && value === "ABSENT"
        ? copy("Absent confirmé")
        : copy(attendanceLabels[value] ?? value)}
    </span>
  );
}

export function AttendanceHistory({ userId, onClose }: { userId?: string; onClose: () => void }) {
  const { text: copy } = useCopy();
  const actor = useCommunity((store) => store.users.find((user) => user.id === store.session?.userId));
  const load = useCallback(() => attendanceService.history(userId), [userId]);
  const remote = useRemote(load);
  return (
    <Modal open onClose={onClose} title={copy("Historique de présence")}>
      <LoadState {...remote} retry={remote.refresh} />
      {!remote.loading && !remote.error && remote.data && (
        <div className="form-stack">
          <h3>
            {remote.data.user.firstName} {remote.data.user.lastName}
          </h3>
          <p>{remote.data.user.email}</p>
          <p>
            {remote.data.presences} {copy("présences ·")} {remote.data.absences}{" "}
            {copy("absences confirmées")}{" "}
          </p>
          {remote.data.alerts.map((alert) => (
            <p key={alert.id} className="attendance-notice">
              {copy("Alerte du")}{" "}
              {new Date(alert.createdAt).toLocaleString(
                currentLanguage() === "en" ? "en-GB" : "fr-FR",
              )}{" "}
              · {alert.resolvedAt ? copy("Résolue après correction ou annulation") : copy("Active")}{" "}
              · {alert.readAt ? copy("Lue") : copy("Non lue")}
            </p>
          ))}
          {remote.data.sessions.map((session) => (
            <section className="attendance-history-card" key={session.id}>
              <h3>{session.question}</h3>
              <p>
                {session.groupName} ·{" "}
                {new Date(session.createdAt).toLocaleDateString(
                  currentLanguage() === "en" ? "en-GB" : "fr-FR",
                )}
              </p>
              <AttendanceBadge value={session.final} global />
              {session.globalEdits?.map((edit) => (
                <p className="tiny muted" key={edit.id}>
                  {new Date(edit.createdAt).toLocaleString(
                    currentLanguage() === "en" ? "en-GB" : "fr-FR",
                  )}{" "}
                  · {edit.actor.firstName} {edit.actor.lastName} :{" "}
                  {copy(attendanceLabels[edit.before] ?? edit.before)} →{" "}
                  {copy(attendanceLabels[edit.after] ?? edit.after)}
                </p>
              ))}
              {session.selections.map((selection) => (
                <div key={selection.optionId} className="attendance-history-slot">
                  <p>
                    {selection.label} ·{" "}
                    {new Date(selection.startsAt).toLocaleString(
                      currentLanguage() === "en" ? "en-GB" : "fr-FR",
                    )}
                    {selection.endsAt
                      ? ` → ${new Date(selection.endsAt).toLocaleString(currentLanguage() === "en" ? "en-GB" : "fr-FR")}`
                      : ""}{" "}
                    <AttendanceBadge value={selection.attendance} />
                  </p>
                  {!!selection.edits.length && (
                    <details>
                      <summary>
                        {" "}
                        {copy("Modifications (")} {selection.edits.length})
                      </summary>
                      {selection.edits.map((edit) => (
                        <p key={edit.id} className="tiny">
                          {new Date(edit.createdAt).toLocaleString(
                            currentLanguage() === "en" ? "en-GB" : "fr-FR",
                          )}{" "}
                          · {edit.actor.firstName} {edit.actor.lastName} :{" "}
                          {copy(attendanceLabels[edit.before] ?? edit.before)} →{" "}
                          {copy(attendanceLabels[edit.after] ?? edit.after)}
                        </p>
                      ))}
                    </details>
                  )}
                </div>
              ))}
              {session.archivedAt && <p className="small muted">{copy("Séance archivée · Présences conservées")}</p>}
              {userId && !session.archivedAt && session.selections.length > 0 && session.status !== "CANCELLED" && (
                <Button asChild size="sm" variant="secondary">
                  <Link href={attendanceSessionHref(session.id, actor?.role)}>
                    {" "}
                    {copy("Corriger les présences")}{" "}
                  </Link>
                </Button>
              )}
            </section>
          ))}
          {!remote.data.sessions.length && (
            <Empty title={copy("Aucune séance")}>
              {copy(
                "Votre historique apparaîtra après publication des séances de vos groupes.",
              )}{" "}
            </Empty>
          )}
        </div>
      )}
    </Modal>
  );
}

function SessionEditor({ poll, close, votesOnly = false }: { poll?: Poll; close: () => void; votesOnly?: boolean }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [groupId, setGroupId] = useState(poll?.groupId ?? "");
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [description, setDescription] = useState(poll?.description ?? "");
  const [deadline, setDeadline] = useState(poll?.endsAt ? localDateTime(poll.endsAt) : "");
  const [status, setStatus] = useState<SessionInput["status"]>(
    poll?.attendanceLockedAt && poll.status === "OPEN" ? "CLOSED" : (poll?.status ?? "OPEN"),
  );
  const [slots, setSlots] = useState(
    () =>
      poll?.options.map((o) => ({
        key: o.id,
        label: o.label,
        startsAt: o.startsAt ? localDateTime(o.startsAt) : "",
        endsAt: o.endsAt ? localDateTime(o.endsAt) : "",
      })) ?? [{ key: crypto.randomUUID(), label: "Horaire 1", startsAt: "", endsAt: "" }],
  );
  const [busy, setBusy] = useState(false);
  const locked = !!poll?.votes.length || !!poll?.attendanceLockedAt;
  const mandatory = poll ? !!poll.mandatoryAttendance : true;
  return (
    <Modal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={poll ? copy("Modifier la séance") : copy(votesOnly ? "Créer un sondage de séance" : "Créer une séance")}
    >
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const ok = await attempt(
            async () => {
              const input: SessionInput = {
                question,
                description,
                type: "SESSION",
                mandatoryAttendance: mandatory,
                ...(mandatory
                  ? {
                      slotEndsAt: locked
                        ? poll!.options.map((o) => o.endsAt!)
                        : slots.map((s) => new Date(s.endsAt).toISOString()),
                    }
                  : {}),
                singleChoice: false,
                status,
                endsAt: poll?.attendanceLockedAt ? poll.endsAt! : new Date(deadline).toISOString(),
                options: slots.map((s) => s.label),
                startsAt: locked
                  ? poll!.options.map((o) => o.startsAt!)
                  : slots.map((s) => new Date(s.startsAt).toISOString()),
              };
              const saved = poll
                ? await attendanceService.update(poll.id, input)
                : await attendanceService.create(groupId, input);
              store.receivePoll(saved);
              await store.sync();
            },
            poll ? copy("Séance mise à jour") : copy("Séance publiée dans le groupe"),
          );
          setBusy(false);
          if (ok) close();
        }}
      >
        <label>
          {copy("Titre")}{" "}
          <input
            required
            minLength={3}
            maxLength={200}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        {poll && (
          <label>
            {copy("Description")}{" "}
            <textarea
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        )}
        <label>
          {copy("Groupe")}{" "}
          <select
            required
            value={groupId}
            disabled={!!poll}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value=""> {copy("Choisir un groupe")} </option>
            {store.groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {copy("Date limite de vote")}{" "}
          <input
            required
            type="datetime-local"
            value={deadline}
            disabled={!!poll?.attendanceLockedAt}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          {copy("Statut")}{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SessionInput["status"])}
          >
            {!poll?.attendanceLockedAt && (
              <option value="OPEN"> {copy("Ouvert aux votes")} </option>
            )}
            <option value="CLOSED"> {copy("Clôturé")} </option>
            {poll && <option value="CANCELLED"> {copy("Annulé (exclu des absences)")} </option>}
          </select>
        </label>
        <p className="muted">
          {copy(
            "De 1 à 100 horaires, tous postérieurs à la clôture. Choix multiples autorisés. Les horaires sont verrouillés dès le premier vote.",
          )}{" "}
        </p>
        {mandatory && !votesOnly && (
          <p className="small muted">
            {copy(
              "Séance obligatoire : tous les étudiants approuvés du groupe sont concernés, même sans vote. Les changements ultérieurs de membres se gèrent depuis le pointage.",
            )}{" "}
          </p>
        )}
        {slots.map((slot, index) => (
          <fieldset className="attendance-history-card" key={slot.key} disabled={busy || locked}>
            <legend>
              {" "}
              {copy("Horaire")} {index + 1}
            </legend>
            <label>
              {copy("Libellé")}{" "}
              <input
                required
                maxLength={200}
                value={slot.label}
                onChange={(e) =>
                  setSlots((rows) =>
                    rows.map((s) => (s.key === slot.key ? { ...s, label: e.target.value } : s)),
                  )
                }
              />
            </label>
            <label>
              {copy("Date et heure")}{" "}
              <input
                required
                type="datetime-local"
                value={slot.startsAt}
                onChange={(e) =>
                  setSlots((rows) =>
                    rows.map((s) => (s.key === slot.key ? { ...s, startsAt: e.target.value } : s)),
                  )
                }
              />
            </label>
            {mandatory && (
              <label>
                {copy("Fin du créneau")}{" "}
                <input
                  required
                  type="datetime-local"
                  value={slot.endsAt}
                  min={slot.startsAt || undefined}
                  onChange={(e) =>
                    setSlots((rows) =>
                      rows.map((s) => (s.key === slot.key ? { ...s, endsAt: e.target.value } : s)),
                    )
                  }
                />
              </label>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={slots.length <= 1}
              onClick={() => setSlots((rows) => rows.filter((s) => s.key !== slot.key))}
            >
              {copy("Supprimer cet horaire")}{" "}
            </Button>
          </fieldset>
        ))}
        <Button
          type="button"
          variant="secondary"
          disabled={busy || locked || slots.length >= 100}
          onClick={() =>
            setSlots((rows) => [
              ...rows,
              {
                key: crypto.randomUUID(),
                label: `Horaire ${rows.length + 1}`,
                startsAt: "",
                endsAt: "",
              },
            ])
          }
        >
          {copy("Ajouter un horaire")}{" "}
        </Button>
        <Button type="submit" disabled={busy || !groupId}>
          {busy ? copy("Enregistrement…") : copy(votesOnly ? "Publier le sondage de séance" : "Enregistrer la séance")}
        </Button>
      </form>
    </Modal>
  );
}

export function AttendanceDashboard({ compact = false }: { compact?: boolean }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [filters, setFilters] = useState<Record<string, string>>({ page: "1", order: "desc" });
  const serialized = JSON.stringify(filters);
  const load = useCallback(() => attendanceService.overview(JSON.parse(serialized)), [serialized]);
  const remote = useRemote(load);
  const alertsLoad = useCallback(() => attendanceService.alerts(), []);
  const alerts = useRemote(alertsLoad);
  const [history, setHistory] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const update = (key: string, value: string) =>
    setFilters((f) => ({ ...f, [key]: value, ...(key !== "page" ? { page: "1" } : {}) }));
  const refresh = () => {
    remote.refresh();
    alerts.refresh();
  };
  const refreshRemote = remote.refresh;
  const refreshAlerts = alerts.refresh;
  // Poll only reads: threshold alerts are generated transactionally by writes in the backend.
  useEffect(() => {
    const timer = setInterval(() => {
      refreshRemote();
      refreshAlerts();
    }, 30000);
    return () => clearInterval(timer);
  }, [refreshRemote, refreshAlerts]);
  return (
    <section className="attendance-section" id="attendance">
      <div className="row wrap between">
        <h2> {copy("Suivi des présences")} </h2>
        <Button variant="secondary" onClick={refresh}>
          {copy("Actualiser")}{" "}
        </Button>
      </div>
      <LoadState {...remote} retry={remote.refresh} />
      {remote.data && (
        <>
          <div className="stats-grid attendance-stats">
            {[
              ["Sondages de séance", remote.data.stats.sessions],
              [copy("Étudiants inscrits"), remote.data.stats.students],
              [copy("Présences confirmées"), remote.data.stats.presences],
              [copy("Absences confirmées"), remote.data.stats.absences],
              [copy("Étudiants à 3 absences ou plus"), remote.data.stats.threshold],
              [copy("Alertes non lues"), remote.data.stats.unreadAlerts],
            ].map(([label, value]) => (
              <div className="stat-card" key={label}>
                <span>{copy(String(label))}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          {!compact && (
            <div className="panel">
              <p className="muted">
                {copy(
                  "Les dates filtrent la création des sondages (UTC). Les présences suivent les séances filtrées. Le total des absences et le seuil de trois absences sont calculés séparément pour chaque organisateur.",
                )}{" "}
              </p>
              <div className="request-filters">
                <label>
                  {copy("Nom ou email")}{" "}
                  <input
                    type="search"
                    value={filters.search ?? ""}
                    onChange={(e) => update("search", e.target.value)}
                  />
                </label>
                <label>
                  {copy("Groupe")}{" "}
                  <select
                    value={filters.groupId ?? ""}
                    onChange={(e) => update("groupId", e.target.value)}
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
                  {copy("Sondage")}{" "}
                  <select
                    value={filters.pollId ?? ""}
                    onChange={(e) => update("pollId", e.target.value)}
                  >
                    <option value=""> {copy("Toutes les séances")} </option>
                    {store.polls
                      .filter((p) => p.type === "SESSION")
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.question}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {copy("Depuis")}{" "}
                  <input
                    type="date"
                    value={filters.from ?? ""}
                    onChange={(e) => update("from", e.target.value)}
                  />
                </label>
                <label>
                  {copy("Jusqu’au")}{" "}
                  <input
                    type="date"
                    value={filters.to ?? ""}
                    onChange={(e) => update("to", e.target.value)}
                  />
                </label>
                <label>
                  {copy("Seuil")}{" "}
                  <select
                    value={filters.threshold ?? ""}
                    onChange={(e) => update("threshold", e.target.value)}
                  >
                    <option value=""> {copy("Tous les inscrits")} </option>
                    <option value="true"> {copy("Au moins 3 absences")} </option>
                  </select>
                </label>
                <label>
                  {copy("Trier les absences")}{" "}
                  <select value={filters.order} onChange={(e) => update("order", e.target.value)}>
                    <option value="desc"> {copy("Décroissant")} </option>
                    <option value="asc"> {copy("Croissant")} </option>
                  </select>
                </label>
                <Button
                  variant="secondary"
                  onClick={() => setFilters({ page: "1", order: "desc" })}
                >
                  {copy("Réinitialiser les filtres")}{" "}
                </Button>
              </div>
              <p role="status">
                {remote.data.total} {copy("étudiant(s) trouvé(s)")}{" "}
              </p>
              <div className="table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th> {copy("Étudiant")} </th>
                      <th> {copy("Groupe")} </th>
                      <th> {copy("Présences")} </th>
                      <th> {copy("Absences")} </th>
                      <th> {copy("Statut")} </th>
                      <th> {copy("Actions")} </th>
                    </tr>
                  </thead>
                  <tbody>
                    {remote.data.items.map((row) => (
                      <tr key={row.user.id}>
                        <td>
                          {row.user.firstName} {row.user.lastName}
                          <span className="table-email">{row.user.email}</span>
                        </td>
                        <td>{row.groups.join(", ")}</td>
                        <td>{row.presences}</td>
                        <td>
                          {row.totalAbsences}
                          <span className="table-email">
                            {row.absences} {copy("dans les séances filtrées")}{" "}
                          </span>
                        </td>
                        <td>
                          {row.totalAbsences >= 3
                            ? copy("Alerte")
                            : row.pending
                              ? copy("Vérification en attente")
                              : copy("Normal")}
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setHistory(row.user.id)}
                          >
                            {copy("Voir l’historique")}{" "}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!remote.data.total && (
                <Empty title={copy("Aucun inscrit trouvé")}>
                  {copy("Modifiez les filtres ou attendez les premiers votes.")}{" "}
                </Empty>
              )}
              <nav
                className="row wrap between request-pagination"
                aria-label={copy("Pagination des présences")}
              >
                <Button
                  variant="secondary"
                  disabled={+filters.page <= 1 || remote.loading}
                  onClick={() => update("page", String(+filters.page - 1))}
                >
                  {copy("Précédent")}{" "}
                </Button>
                <span>
                  {copy("Page")} {filters.page} {copy("sur")}{" "}
                  {Math.max(1, Math.ceil(remote.data.total / 20))}
                </span>
                <Button
                  variant="secondary"
                  disabled={+filters.page * 20 >= remote.data.total || remote.loading}
                  onClick={() => update("page", String(+filters.page + 1))}
                >
                  {copy("Suivant")}{" "}
                </Button>
              </nav>
            </div>
          )}
        </>
      )}
      <section className="panel" id="absence-alerts">
        <h2> {copy("Alertes d’absence")} </h2>
        <LoadState {...alerts} retry={alerts.refresh} />
        <p className="muted">
          {copy(
            "Une alerte est enregistrée à chaque franchissement de trois absences confirmées. Une correction sous le seuil la résout.",
          )}{" "}
        </p>
        <div className="attendance-alert-list">
          {(compact ? alerts.data?.filter((a) => !a.resolvedAt).slice(0, 5) : alerts.data)?.map(
            (alert) => (
              <article className="attendance-history-card" key={alert.id}>
                <h3>
                  {alert.user?.firstName} {alert.user?.lastName}
                </h3>
                <p>
                  {alert.user?.email} · {alert.groupName}
                </p>
                <p>
                  {copy("Alerte :")} {alert.user?.firstName} {alert.user?.lastName}{" "}
                  {copy(
                    "a atteint 3 absences confirmées. Veuillez consulter son historique de présence.",
                  )}{" "}
                </p>
                <p>
                  {copy("Total actuel :")} {alert.pollIds?.length ?? 0}{" "}
                  {copy("· Déclenchée le")}{" "}
                  {new Date(alert.createdAt).toLocaleString(
                    currentLanguage() === "en" ? "en-GB" : "fr-FR",
                  )}{" "}
                  · {alert.resolvedAt ? copy("Résolue") : copy("Active")} ·{" "}
                  {alert.readAt ? copy("Lue") : copy("Non lue")}
                </p>
                <div className="row wrap">
                  <Button size="sm" variant="secondary" onClick={() => setHistory(alert.userId)}>
                    {copy("Voir l’historique")}{" "}
                  </Button>
                  {!alert.readAt && (
                    <Button
                      size="sm"
                      disabled={!!reading}
                      onClick={async () => {
                        setReading(alert.id);
                        await attempt(
                          () => attendanceService.read(alert.id),
                          copy("Alerte marquée comme lue"),
                        );
                        setReading(null);
                        refresh();
                      }}
                    >
                      {copy("Marquer comme lue")}{" "}
                    </Button>
                  )}
                </div>
              </article>
            ),
          )}
        </div>
        {!alerts.loading &&
          !alerts.error &&
          !(compact ? alerts.data?.some((a) => !a.resolvedAt) : alerts.data?.length) && (
            <p>
              {" "}
              {copy("Aucune alerte d’absence")} {compact ? " active" : ""}.
            </p>
          )}
      </section>
      {history && (
        <AttendanceHistory
          userId={history}
          onClose={() => {
            setHistory(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

export function SessionPollsScreen({ pollsOnly = false, createSession = false }: { pollsOnly?: boolean; createSession?: boolean }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const id = useId();
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const canManage = actor?.role === "ADMIN" || actor?.role === "COLLABORATOR";
  const [tab, setTab] = useState("polls");
  const [editing, setEditing] = useState<Poll | "new" | null>(createSession ? "new" : null);
  const [ordinary, setOrdinary] = useState(false);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState<ActivityFilters>({ ...defaultActivityFilters });
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [manageId, setManageId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const update = (patch: Partial<ActivityFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const results = filterActivities(store.polls.filter((poll) => actor?.role === "USER" || poll.type !== "SESSION" || poll.authorId === actor?.id), filters, now);
  const pages = Math.max(1, Math.ceil(results.length / 10));
  const currentPage = Math.min(page, pages);
  const detail = store.polls.find((poll) => poll.id === detailId);
  const managed = store.polls.find((poll) => poll.id === manageId);
  const types = [
    { value: "ALL", label: "Toutes" },
    { value: "SESSION", label: pollsOnly ? "Sondages de séance" : "Séances" },
    ...(actor?.role === "COLLABORATOR" ? [] : [{ value: "ORDINARY" as const, label: pollsOnly ? "Sondages simples" : "Sondages" }]),
  ] as const;
  const dateTime = (date: string) =>
    new Date(date).toLocaleString(currentLanguage() === "en" ? "en-GB" : "fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const statusLabel = (poll: Poll) => {
    const status = activityStatus(poll, now);
    return status === "CANCELLED"
      ? copy("Annulée")
      : status === "CLOSED"
        ? !pollsOnly && poll.type === "SESSION"
          ? copy("Inscriptions closes")
          : copy("Terminé")
        : !pollsOnly && poll.type === "SESSION"
          ? copy("Inscriptions ouvertes")
          : copy("En cours");
  };
  const badge = (poll: Poll) => (
    <span className={`activity-status status-${activityStatus(poll, now).toLowerCase()}`}>
      {statusLabel(poll)}
    </span>
  );

  return (
    <div className="activities-workspace">
      {!pollsOnly && <nav className="activity-navigation" aria-label={copy("Navigation des séances et sondages")}>
        <Button
          variant={tab === "polls" ? "default" : "ghost"}
          aria-pressed={tab === "polls"}
          aria-controls={`${id}-workspace`}
          onClick={() => setTab("polls")}
        >
          <CalendarDays size={17} aria-hidden="true" /> {copy("Activités")}{" "}
        </Button>
        {canManage && (
          <Button
            variant={tab === "attendance" ? "default" : "ghost"}
            aria-pressed={tab === "attendance"}
            aria-controls={`${id}-workspace`}
            onClick={() => setTab("attendance")}
          >
            <ClipboardCheck size={17} aria-hidden="true" /> {copy("Présences et alertes")}{" "}
          </Button>
        )}
      </nav>}
      <div id={`${id}-workspace`}>
        {tab === "attendance" && canManage ? (
          <>
            <div className="activity-attendance-heading">
              <Button size="sm" variant="ghost" onClick={() => setTab("polls")}>
                <ArrowLeft size={16} aria-hidden="true" /> {copy("Retour aux activités")}{" "}
              </Button>
              <nav className="row wrap" aria-label={copy("Accès rapide au suivi")}>
                <a href="#attendance"> {copy("Suivi des étudiants")} </a>
                <a href="#absence-alerts"> {copy("Alertes d’absence")} </a>
              </nav>
            </div>
            <AttendanceDashboard key={revision} />
          </>
        ) : (
          <>
            {canManage && (
              <div className="activity-create-grid">
                <section className="activity-create-card">
                  <span className="activity-icon">
                    <CalendarDays size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h2> {copy(pollsOnly ? "Sondage de séance" : "Séances")} </h2>
                    <p>
                      {copy(
                        pollsOnly ? "Proposez des créneaux et consultez les membres qui ont choisi chaque horaire." : "Planifiez vos entraînements, recueillez les inscriptions et suivez les présences.",
                      )}{" "}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={!store.groups.length}
                    onClick={() => setEditing("new")}
                  >
                    <Plus size={16} aria-hidden="true" /> {copy(pollsOnly ? "Créer un sondage de séance" : "Créer une séance")}{" "}
                  </Button>
                </section>
                {actor?.role === "ADMIN" && (                <section className="activity-create-card">
                  <span className="activity-icon">
                    <ChartNoAxesColumn size={22} aria-hidden="true" />
                  </span>
                  <div>
                    <h2> {copy(pollsOnly ? "Sondage simple" : "Sondages")} </h2>
                    <p>
                      {copy(
                        "Posez une question à vos membres et consultez leurs votes en un seul endroit.",
                      )}{" "}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={pollsOnly ? "default" : "secondary"}
                    disabled={!store.groups.length}
                    onClick={() => setOrdinary(true)}
                  >
                    <Plus size={16} aria-hidden="true" /> {copy(pollsOnly ? "Créer un sondage simple" : "Créer un sondage")}{" "}
                  </Button>
                </section>)}
              </div>
            )}
            {canManage && !store.groups.length && !store.loading && !store.error && (
              <p className="small muted" role="status">
                {copy(
                  pollsOnly ? "Créez d’abord un groupe pour publier un sondage." : "Créez d’abord un groupe dans la rubrique Groupes pour publier une activité.",
                )}{" "}
              </p>
            )}
            <section className="panel activity-list-panel" aria-labelledby={`${id}-title`}>
              <div className="activity-list-heading">
                <h2 id={`${id}-title`}> {copy(pollsOnly ? "Tous les sondages" : "Toutes les activités")} </h2>
                <span className="tiny muted">
                  {store.polls.length} {copy("au total")}{" "}
                </span>
              </div>
              <div
                className="request-status-tabs activity-type-tabs"
                role="tablist"
                aria-label={copy(pollsOnly ? "Type de sondage" : "Type d’activité")}
              >
                {types.map((type, index) => (
                  <button
                    key={type.value}
                    type="button"
                    role="tab"
                    id={`${id}-${type.value}`}
                    aria-selected={filters.type === type.value}
                    aria-controls={`${id}-results`}
                    tabIndex={filters.type === type.value ? 0 : -1}
                    onClick={() => update({ type: type.value })}
                    onKeyDown={(event) => {
                      const next =
                        event.key === "ArrowRight"
                          ? (index + 1) % types.length
                          : event.key === "ArrowLeft"
                            ? (index + types.length - 1) % types.length
                            : event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? types.length - 1
                                : null;
                      if (next === null) return;
                      event.preventDefault();
                      update({ type: types[next].value });
                      document.getElementById(`${id}-${types[next].value}`)?.focus();
                    }}
                  >
                    {copy(type.label)}
                    <span>
                      {type.value === "ALL"
                        ? store.polls.length
                        : store.polls.filter((poll) => (poll.type ?? "ORDINARY") === type.value)
                            .length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="request-primary-filters activity-filters">
                <label className="request-search">
                  {copy("Rechercher par titre")}{" "}
                  <span className="request-search-input">
                    <Search size={17} aria-hidden="true" />
                    <input
                      type="search"
                      placeholder={copy(pollsOnly ? "Titre du sondage…" : "Titre de séance ou de sondage…")}
                      value={filters.search}
                      maxLength={200}
                      onChange={(event) => update({ search: event.target.value })}
                    />
                  </span>
                </label>
                <label>
                  {copy("Groupe")}{" "}
                  <select
                    value={filters.groupId}
                    onChange={(event) => update({ groupId: event.target.value })}
                  >
                    <option value=""> {copy("Tous les groupes")} </option>
                    {store.groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {copy("Statut")}{" "}
                  <select
                    value={filters.status}
                    onChange={(event) =>
                      update({ status: event.target.value as ActivityFilters["status"] })
                    }
                  >
                    <option value="ALL"> {copy("Tous les statuts")} </option>
                    <option value="OPEN"> {copy(pollsOnly ? "En cours" : "En cours / inscriptions ouvertes")} </option>
                    <option value="CLOSED"> {copy(pollsOnly ? "Terminé" : "Terminé / inscriptions closes")} </option>
                    <option value="CANCELLED"> {copy("Annulées")} </option>
                  </select>
                </label>
              </div>
              <div className="activity-results-toolbar">
                <p role="status" aria-live="polite">
                  {store.loading
                    ? copy(pollsOnly ? "Actualisation des sondages…" : "Actualisation des activités…")
                    : pollsOnly ? copy("{count} sondage(s)", { count: results.length }) : `${results.length} activité${results.length !== 1 ? "s" : ""} trouvée${results.length !== 1 ? "s" : ""}`}
                </p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update({ ...defaultActivityFilters })}
                >
                  <RotateCcw size={14} aria-hidden="true" /> {copy("Réinitialiser")}{" "}
                </Button>
              </div>
              {store.error && (
                <div className="request-error" role="alert">
                  <p className="error">{store.error}</p>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={store.loading}
                    onClick={() => void store.sync()}
                  >
                    {copy("Réessayer")}{" "}
                  </Button>
                </div>
              )}
              <div
                id={`${id}-results`}
                role="tabpanel"
                aria-labelledby={`${id}-${filters.type}`}
                tabIndex={0}
                aria-busy={store.loading}
              >
                {store.loading && !store.polls.length && (
                  <div className="activity-loading" role="status">
                    <span className="skeleton" />
                    <span className="skeleton" />
                    {copy(pollsOnly ? "Chargement des sondages…" : "Chargement des activités…")}{" "}
                  </div>
                )}
                <div className="activity-list">
                  {results.slice((currentPage - 1) * 10, currentPage * 10).map((poll) => {
                    const session = poll.type === "SESSION";
                    return (
                      <article
                        className="activity-card"
                        key={poll.id}
                        aria-labelledby={`${id}-poll-${poll.id}`}
                      >
                        <div className="activity-card-main">
                          <div className="activity-card-meta">
                            <span className="activity-kind">
                              {session ? (
                                <CalendarDays size={14} aria-hidden="true" />
                              ) : (
                                <ChartNoAxesColumn size={14} aria-hidden="true" />
                              )}
                              {copy(pollsOnly ? session ? "Sondage de séance" : "Sondage simple" : session ? "Séance" : "Sondage")}
                            </span>
                            {badge(poll)}
                          </div>
                          <h3 id={`${id}-poll-${poll.id}`}>{poll.question}</h3>
                          <p className="activity-group">
                            {store.groups.find((group) => group.id === poll.groupId)?.name ??
                              copy("Groupe indisponible")}
                          </p>
                          {session && (
                            <ul className="activity-schedule">
                              {poll.options.slice(0, 2).map((option) => (
                                <li key={option.id}>
                                  <CalendarDays size={14} aria-hidden="true" />
                                  <span>
                                    {option.label}
                                    {option.startsAt && (
                                      <>
                                        {" "}
                                        ·{" "}
                                        <time dateTime={option.startsAt}>
                                          {dateTime(option.startsAt)}
                                        </time>
                                      </>
                                    )}
                                  </span>
                                </li>
                              ))}
                              {poll.options.length > 2 && (
                                <li className="tiny muted">
                                  + {poll.options.length - 2}{" "}
                                  {copy("autre(s) horaire(s), dans les détails")}{" "}
                                </li>
                              )}
                            </ul>
                          )}
                          <div className="activity-card-facts">
                            {session && poll.endsAt && (
                              <span>
                                <Clock3 size={14} aria-hidden="true" />
                                {copy("Inscriptions jusqu’au")}{" "}
                                <time dateTime={poll.endsAt}>{dateTime(poll.endsAt)}</time>
                              </span>
                            )}
                            <span>
                              <Users size={14} aria-hidden="true" />
                              {poll.votes.length} {copy(session ? "inscrit(s)" : "réponse(s)")}
                            </span>
                          </div>
                        </div>
                        <div className="activity-card-actions">
                          <Button
                            variant="secondary"
                            size="sm"
                            aria-label={`${session && !pollsOnly ? copy("Voir les détails") : copy("Voir les résultats")} : ${poll.question}`}
                            onClick={() => {
                              setDetailId(poll.id);
                              if (pollsOnly) void store.sync();
                            }}
                          >
                            {session && !pollsOnly ? copy("Voir les détails") : copy("Voir les résultats")}
                          </Button>
                          <DeleteContent poll={poll} />
                          {session && canManage && pollsOnly && <Button size="sm" variant="secondary" disabled={poll.status === "CANCELLED"} onClick={() => setEditing(poll)}>{copy("Modifier / annuler")}</Button>}
                          {session && canManage && pollsOnly && <Button size="sm" variant="secondary" aria-label={`${copy("Gérer la séance")} : ${poll.question}`} onClick={() => setManageId(poll.id)}>{copy("Gérer la séance")}</Button>}
                          {session && canManage && !pollsOnly && (
                            <Button
                              size="sm"
                              aria-label={`Gérer les présences : ${poll.question}`}
                              asChild
                            >
                              <Link href={attendanceSessionHref(poll.id, actor?.role)}>
                                <ClipboardCheck size={15} aria-hidden="true" />{" "}
                                {copy("Gérer les présences")}{" "}
                              </Link>
                            </Button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {!results.length && !store.loading && !store.error && (
                  <Empty
                    title={
                      store.polls.length
                        ? copy(pollsOnly ? "Aucun sondage ne correspond" : "Aucune activité ne correspond")
                        : copy(pollsOnly ? "Aucun sondage pour le moment" : "Votre première activité commence ici")
                    }
                  >
                    {store.polls.length
                      ? copy(
                          pollsOnly ? "Ajustez la recherche, le groupe ou le statut pour retrouver un sondage." : "Modifiez le type, le groupe ou le statut pour retrouver une activité.",
                        )
                      : copy(
                          pollsOnly ? "Créez un sondage pour recueillir les avis de votre groupe." : "Créez une séance pour organiser un entraînement ou un sondage pour recueillir les avis de la team.",
                        )}
                  </Empty>
                )}
                {results.length > 10 && (
                  <nav
                    className="row wrap between request-pagination"
                    aria-label={copy(pollsOnly ? "Pagination des sondages" : "Pagination des activités")}
                  >
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentPage === 1 || store.loading}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      {copy("Précédent")}{" "}
                    </Button>
                    <span className="tiny muted">
                      {copy("Page")} {currentPage} {copy("sur")} {pages}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={currentPage === pages || store.loading}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      {copy("Suivant")}{" "}
                    </Button>
                  </nav>
                )}
              </div>
            </section>
          </>
        )}
      </div>
      {canManage && managed && <SessionManagement poll={managed} close={() => setManageId(null)} />}
      {detail && (
        <Modal
          open
          onClose={() => setDetailId(null)}
          title={
            !pollsOnly && detail.type === "SESSION" ? copy("Détails de la séance") : copy("Résultats du sondage")
          }
        >
          <div className="activity-detail">
            <div className="row wrap between">
              <span className="small muted">
                {store.groups.find((group) => group.id === detail.groupId)?.name}
              </span>
              {badge(detail)}
            </div>
            {pollsOnly ? <PollVoteResults poll={detail} /> : <PollCard poll={detail} showResults={canManage} />}
            {canManage && !pollsOnly && (
              <section aria-label={copy("Participants")}>
                <h3>{copy("Participants")}</h3>
                {!detail.votes.length && <p className="muted">{copy("Aucune participation")}</p>}
                <ul className="notification-list">
                  {detail.votes.map((vote) => {
                    const member = store.users.find((candidate) => candidate.id === vote.userId);
                    return (
                      <li key={vote.userId}>
                        <strong>
                          {member
                            ? member.firstName + " " + member.lastName
                            : copy("Compte indisponible")}
                        </strong>
                        <p>
                          {detail.options
                            .filter((option) => vote.optionIds.includes(option.id))
                            .map((option) => option.label)
                            .join(", ")}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {canManage && !pollsOnly && detail.type === "SESSION" && (
              <div className="row wrap activity-detail-actions">
                <Button asChild>
                  <Link href={attendanceSessionHref(detail.id, actor?.role)}>
                    <ClipboardCheck size={16} aria-hidden="true" />{" "}
                    {copy("Gérer les présences")}{" "}
                  </Link>
                </Button>
                <Button
                  variant="secondary"
                  disabled={detail.status === "CANCELLED"}
                  onClick={() => {
                    setDetailId(null);
                    setEditing(detail);
                  }}
                >
                  {copy("Modifier / annuler")}
                </Button>
              </div>
            )}
          </div>
        </Modal>
      )}
      {canManage && editing && (
        <SessionEditor
          votesOnly={pollsOnly}
          poll={editing === "new" ? undefined : editing}
          close={() => {
            setEditing(null);
            setRevision((r) => r + 1);
          }}
        />
      )}
      {canManage && ordinary && <PublishDialog kind="poll" onClose={() => setOrdinary(false)} />}
    </div>
  );
}
