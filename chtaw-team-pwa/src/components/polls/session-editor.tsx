"use client";
import { useState } from "react";
import { useCopy } from "@/lib/i18n";
import { useCommunity } from "@/stores/community";
import { attendanceService, type SessionInput } from "@/services/attendance.service";
import { localDateTime, tunisDateTime } from "@/features/session-polls";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { attempt } from "@/components/shared";
import type { Poll } from "@/types";
import { pollGroupIds } from "@/features/poll-groups";
import { GroupSelection } from "./group-selection";

export function SessionEditor({ poll, groupId: fixedGroupId, close, votesOnly = false }: {
  poll?: Poll;
  groupId?: string;
  close: () => void;
  votesOnly?: boolean;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [groupIds, setGroupIds] = useState<string[]>(poll ? pollGroupIds(poll) : fixedGroupId ? [fixedGroupId] : []);
  const groupId = poll?.groupId ?? fixedGroupId ?? groupIds[0] ?? "";
  const [question, setQuestion] = useState(poll?.question ?? "");
  const [description, setDescription] = useState(poll?.description ?? "");
  const [status, setStatus] = useState<SessionInput["status"]>(
    poll?.status ?? "OPEN",
  );
  const [slots, setSlots] = useState(
    () =>
      poll?.options.map((o) => ({
        key: o.id,
        label: o.label,
        startsAt: o.startsAt ? localDateTime(o.startsAt) : "",
        capacity: o.capacity?.toString() ?? "",
      })) ?? [{ key: crypto.randomUUID(), label: "Horaire 1", startsAt: "", capacity: "" }],
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
          if (busy) return;
          setBusy(true);
          const ok = await attempt(
            async () => {
              const input: SessionInput = {
                ...(!poll && groupIds.length > 1 ? { groupIds } : {}),
                question,
                description,
                type: "SESSION",
                mandatoryAttendance: mandatory,
                singleChoice: true,
                status,
                capacities: slots.map((s) => Number(s.capacity)),
                options: locked ? poll!.options.map((o) => o.label) : slots.map((_, index) => `Horaire ${index + 1}`),
                startsAt: locked
                  ? poll!.options.map((o) => o.startsAt!)
                  : slots.map((s) => tunisDateTime(s.startsAt)),
              };
              const saved = poll
                ? await attendanceService.update(poll.id, input)
                : await attendanceService.create(groupId, input);
              store.receivePoll(saved);
              await store.sync();
            },
            poll ? copy("Séance mise à jour") : copy("Séance publiée dans les groupes sélectionnés"),
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
        <fieldset className="attendance-history-card" disabled={busy || !!poll}>
          <legend>{copy("Groupes concernés")}</legend>
          <GroupSelection groups={store.groups} value={groupIds} onChange={setGroupIds} fixedId={fixedGroupId} />
          <p className="small muted">{copy("Un seul sondage et des places partagées entre tous les groupes sélectionnés.")}</p>
        </fieldset>
        <label>
          {copy("Statut")}{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as SessionInput["status"])}
          >
            {poll?.status !== "CLOSED" && (
              <option value="OPEN"> {copy("Ouvert aux votes")} </option>
            )}
            <option value="CLOSED"> {copy("Clôturé")} </option>
            {poll && <option value="CANCELLED"> {copy("Annulé (exclu des absences)")} </option>}
          </select>
        </label>
        <p className="muted">
          {copy(
            "De 1 à 100 créneaux en heure de Tunis. Durée automatique : 1 h 30. Un seul choix par étudiant. Les horaires sont verrouillés dès le premier vote.",
          )}{" "}
        </p>
        {mandatory && !votesOnly && (
          <p className="small muted">
            {copy(
              "Séance obligatoire : tous les étudiants approuvés des groupes sélectionnés sont concernés, même sans vote. Chaque étudiant compte une seule fois.",
            )}{" "}
          </p>
        )}
        {slots.map((slot, index) => (
          <fieldset className="attendance-history-card" key={slot.key} disabled={busy}>
            <legend>
              {" "}
              {copy("Horaire")} {index + 1}
            </legend>
            <label>
              {copy("Date et heure")}{" "}
              <input
                required
                type="datetime-local"
                disabled={locked}
                value={slot.startsAt}
                onChange={(e) =>
                  setSlots((rows) =>
                    rows.map((s) => (s.key === slot.key ? { ...s, startsAt: e.target.value } : s)),
                  )
                }
              />
            </label>
            <label>
              {copy("Nombre maximal de participants")}
              <input required type="number" min={1} max={2147483647} step={1} value={slot.capacity}
                onChange={(e) => setSlots((rows) => rows.map((s) => s.key === slot.key ? { ...s, capacity: e.target.value } : s))} />
            </label>
            <p className="small muted">{copy("Durée : 1 h 30 · Africa/Tunis")}</p>
            <Button
              type="button"
              variant="secondary"
              disabled={locked || slots.length <= 1}
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
                capacity: "",
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

