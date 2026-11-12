"use client";
import { useState } from "react";
import { useCopy } from "@/lib/i18n";
import { useCommunity } from "@/stores/community";
import { attendanceService, type SessionInput } from "@/services/attendance.service";
import { localDateTime } from "@/features/session-polls";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { attempt } from "@/components/shared";
import type { Poll } from "@/types";

export function SessionEditor({ poll, groupId: fixedGroupId, close, votesOnly = false }: {
  poll?: Poll;
  groupId?: string;
  close: () => void;
  votesOnly?: boolean;
}) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const [groupId, setGroupId] = useState(poll?.groupId ?? fixedGroupId ?? "");
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
          if (busy) return;
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
            disabled={!!poll || !!fixedGroupId}
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

