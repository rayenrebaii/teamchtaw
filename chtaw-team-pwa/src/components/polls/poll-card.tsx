"use client";
import { DeleteContent } from "@/components/delete-content";
import { useEffect, useState } from "react";
import { ChartNoAxesColumn, Check } from "lucide-react";
import type { Poll } from "@/types";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
export function PollCard({ poll, showResults = false, hideDeleteAction = false }: { poll: Poll; showResults?: boolean; hideDeleteAction?: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [voting, setVoting] = useState(false);
  const [editing, setEditing] = useState(false);
  const store = useCommunity();
  const { t, locale } = useCopy();
  const mine = poll.votes.find((v) => v.userId === store.session?.userId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const isSession = poll.type === "SESSION";
  const closed = (!!poll.status && poll.status !== "OPEN") || (isSession
    ? !!mine?.attendanceLocked || !!poll.participationLockedUserIds?.includes(store.session?.userId ?? "") || (mine?.optionIds.length ?? 0) > 1 ||
      !!mine?.optionIds.some((id) => { const o = poll.options.find((o) => o.id === id); return !o?.startsAt || Date.parse(o.startsAt) <= now; })
    : (!!poll.endsAt && Date.parse(poll.endsAt) <= now) || !!poll.attendanceLockedAt);
  const adminSession =
    poll.type === "SESSION" &&
    store.users.find((u) => u.id === store.session?.userId)?.role !== "USER";
  const choices = editing ? selected : (mine?.optionIds ?? selected);
  return (
    <div className={`poll-card${poll.type === "SESSION" ? " session-poll" : ""}`}>
      <span className="eyebrow">
        <ChartNoAxesColumn size={14} />{" "}
        {poll.type === "SESSION" ? t("SONDAGE DE SÉANCE") : t("SONDAGE DE LA TEAM")}
      </span>
      <h3>{poll.question}</h3>
      {!hideDeleteAction && <DeleteContent poll={poll} />}
      {poll.description && <p>{poll.description}</p>}
      {isSession && (mine?.optionIds.length ?? 0) > 1 && <p role="status">{t("Votes historiques multiples : contactez l’organisateur pour régulariser votre choix.")}</p>}
      {poll.status === "CANCELLED" && (
        <p role="status">{t("Séance annulée · Exclue du calcul des absences")}</p>
      )}
      <p className="tiny muted">
        {(isSession || poll.singleChoice) ? t("Une seule réponse") : t("Plusieurs réponses possibles")}
        {closed
          ? t(" · Terminé")
          : !isSession && poll.endsAt
            ? t(" · Jusqu’au {date}", { date: new Date(poll.endsAt).toLocaleString(locale) })
            : ""}
      </p>
      <div className="poll-options">
        {poll.options.map((o) => {
          const count = poll.votes.filter((v) => v.optionIds.includes(o.id)).length;
          const slotClosed = isSession && (!o.startsAt || Date.parse(o.startsAt) <= now);
          const full = isSession && o.capacity != null && count >= o.capacity;
          const percent = poll.votes.length ? Math.round((count / poll.votes.length) * 100) : 0;
          return (
            <button
              className={`poll-option ${choices.includes(o.id) ? "selected" : ""}`}
              key={o.id}
              aria-label={o.label}
              aria-pressed={choices.includes(o.id)}
              aria-describedby={isSession ? `slot-state-${o.id}` : undefined}
              disabled={(!!mine && !editing) || closed || voting || adminSession || slotClosed || (isSession && !mine?.optionIds.includes(o.id) && (full || o.capacity == null))}
              onClick={() =>
                setSelected(
                  (isSession || poll.singleChoice)
                    ? (isSession && selected.includes(o.id) ? [] : [o.id])
                    : selected.includes(o.id)
                      ? selected.filter((id) => id !== o.id)
                      : [...selected, o.id],
                )
              }
            >
              {(mine || closed || showResults) && (
                <span className="poll-progress" style={{ width: `${percent}%` }} />
              )}
              <span className="poll-label">
                <span>
                  {choices.includes(o.id) ? <Check size={15} /> : <span className="radio-dot" />}
                  {o.startsAt ? (
                    <span className="session-option-text">
                      {o.label}
                      <small>
                        {new Date(o.startsAt).toLocaleString(locale, { timeZone: "Africa/Tunis" })}
                        {isSession ? (o.endsAt && o.startsAt && Date.parse(o.endsAt) - Date.parse(o.startsAt) !== 5400000 ? ` · ${Math.round((Date.parse(o.endsAt) - Date.parse(o.startsAt)) / 60000)} min (historique)` : " · 1 h 30") : ""}
                      </small>
                    </span>
                  ) : (
                    o.label
                  )}
                </span>
                {isSession && <b id={`slot-state-${o.id}`}>{count} / {o.capacity ?? "?"} · {slotClosed || poll.status === "CLOSED" || poll.status === "CANCELLED" ? t("Clôturé") : full ? t("Complet") : o.capacity == null ? t("Capacité à définir") : t("Ouvert")}</b>}
                {!isSession && (mine || closed || showResults) && (
                  <b>{showResults ? `${count} · ${percent}%` : `${percent}%`}</b>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="row between">
        <span className="tiny muted">
          {t(poll.votes.length === 1 ? "{count} participation" : "{count} participations", { count: poll.votes.length })}
          {mine ? t(" · Vous avez voté") : ""}
        </span>
        {mine && poll.type === "SESSION" && !closed && !editing && !adminSession && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setSelected(mine.optionIds);
              setEditing(true);
            }}
          >{t("Modifier mon vote")}</Button>
        )}
        {(!mine || editing) && !closed && !adminSession && (
          <Button
            size="sm"
            disabled={(!selected.length && !(editing && isSession)) || voting}
            onClick={() => {
              setVoting(true);
              void attempt(async () => {
                await store.vote(poll.id, selected, editing);
                setEditing(false);
              }, "Votre vote a été enregistré").finally(() => setVoting(false));
            }}
          >
            {editing ? t(selected.length ? "Confirmer la modification" : "Retirer mon vote") : t("Confirmer le vote")}
          </Button>
        )}
      </div>
      {mine && poll.type === "SESSION" && (
        <p className="tiny">
          {t("Vos horaires :")}{" "}
          {poll.options
            .filter((o) => mine.optionIds.includes(o.id))
            .map(
              (o) =>
                `${o.label}${o.startsAt ? ` (${new Date(o.startsAt).toLocaleString(locale, { timeZone: "Africa/Tunis" })})` : ""}`,
            )
            .join(", ")}
        </p>
      )}
    </div>
  );
}
