"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { attendanceService } from "@/services/attendance.service";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { attempt } from "@/components/shared";
import type { Poll } from "@/types";
import { pollGroupIds, pollGroupNames } from "@/features/poll-groups";
import { GroupSelection } from "@/components/polls/group-selection";
import styles from "./session-management.module.css";

export function SessionManagement({ poll, close }: { poll: Poll; close: () => void }) {
  const store = useCommunity();
  const { text: copy, locale } = useCopy();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const availableGroups = store.groups.filter(group => !pollGroupIds(poll).includes(group.id));
  const active = !poll.archivedAt && poll.status === "OPEN" && !poll.attendanceLockedAt;
  const future = poll.options.length > 0 && poll.options.every(slot => !!slot.startsAt && Date.parse(slot.startsAt) > now);
  const canRemove = poll.status === "OPEN" && !poll.archivedAt;
  const option = poll.options.find((slot) => slot.id === target);
  const actor = store.users.find((user) => user.id === store.session?.userId);
  if ((actor?.role !== "ADMIN" && actor?.role !== "COLLABORATOR") || (actor?.role !== "ADMIN" && poll.authorId !== actor?.id) || poll.type !== "SESSION") return null;
  return <Modal open title={copy("Gérer la séance")} onClose={() => { if (!busy && !adding) close(); }}>
    <div className={`form-stack ${styles.management}`}>
      <h3>{poll.question}</h3>
      <p className="small muted">{copy("Groupes concernés")} : {pollGroupNames(poll, store.groups)}</p>
      {active && future && availableGroups.length > 0 && <fieldset className="attendance-history-card" disabled={busy || adding}>
        <legend>{copy("Ajouter des groupes")}</legend>
        <GroupSelection groups={availableGroups} value={selectedGroups} onChange={setSelectedGroups} />
        <p className="small muted">{copy("Les votes, capacités et échéances sont conservés. Les nouveaux groupes accèdent aux places restantes.")}</p>
        <Button variant="secondary" disabled={!selectedGroups.length || adding} onClick={async () => {
          setAdding(true);
          const ok = await attempt(async () => { store.receivePoll(await attendanceService.addGroups(poll.id, selectedGroups)); await store.sync(); }, copy("Groupes ajoutés à la séance."));
          setAdding(false); if (ok) setSelectedGroups([]);
        }}>{adding ? copy("Enregistrement…") : copy("Ajouter les groupes sélectionnés")}</Button>
      </fieldset>}
      <ul className={styles.slots}>{poll.options.map((slot) => <li key={slot.id}>
        <div><strong>{slot.label}</strong>{slot.startsAt && <p>{new Date(slot.startsAt).toLocaleString(locale, { timeZone: "Africa/Tunis", dateStyle: "medium", timeStyle: "short" })}</p>}
          <p>{poll.votes.filter(vote => vote.optionIds.includes(slot.id)).length} / {slot.capacity ?? "?"}{slot.capacity != null && poll.votes.filter(vote => vote.optionIds.includes(slot.id)).length >= slot.capacity ? ` · ${copy("Complet")}` : ""}</p>
          <p>{copy(slot.validatedAt ? "Créneau validé" : "En attente de validation")}</p>
        </div>
        {!slot.validatedAt && <Button size="sm" disabled={busy || adding || !slot.startsAt || Date.parse(slot.startsAt) <= now} onClick={async () => {
          setBusy(true);
          await attempt(async () => { store.receivePoll(await attendanceService.validateSlot(poll.id, slot.id)); await store.sync(); }, copy("Créneau validé et planifié."));
          setBusy(false);
        }}>{copy("Valider et planifier")}</Button>}
        <Button size="sm" variant="destructive" disabled={busy || adding || !canRemove || !slot.startsAt || Date.parse(slot.startsAt) <= now || poll.options.length <= 1} aria-label={copy("Retirer le créneau : {slot}", { slot: slot.label })} onClick={() => { setTarget(slot.id); setFailed(false); }}><Trash2 size={14} aria-hidden="true" />{copy("Retirer")}</Button>
      </li>)}</ul>
      {poll.options.length <= 1 && <p className="small muted">{copy("Pour retirer le dernier créneau, supprimez la séance.")}</p>}
      {!canRemove && <p className="small muted">{copy("Cette séance n’est plus ouverte.")}</p>}
      {!target && <Button variant="destructive" disabled={busy || adding} onClick={() => { setTarget("session"); setFailed(false); }}><Trash2 size={15} aria-hidden="true" />{copy("Supprimer la séance")}</Button>}
      {target && <section className={styles.confirmation} aria-label={copy("Confirmation de suppression")}>
        <h4>{target === "session" ? copy(future && !poll.attendanceLockedAt ? "Supprimer définitivement cette séance ?" : "Archiver cette séance ?") : copy("Retirer ce créneau ?")}</h4>
        {option && <p><strong>{option.label}</strong></p>}
        {option && <p>{copy("{count} étudiant(s) concerné(s).", { count: poll.votes.filter(vote => vote.optionIds.includes(option.id)).length })}</p>}
        <p className="small">{copy(target === "session" ? (future && !poll.attendanceLockedAt ? "Cette séance et ses votes seront définitivement supprimés." : "La séance sera retirée des listes actives ; ses votes et son historique de présence seront conservés.") : "Cet horaire et ses votes seront retirés dans tous les groupes. Les autres horaires sont conservés. Un historique de pointage bloque cette action.")}</p>
        <div className="row wrap"><Button variant="secondary" disabled={busy} onClick={() => setTarget(null)}>{copy("Annuler")}</Button>
          <Button variant="destructive" disabled={busy} onClick={async () => {
            if (busy) return;
            setBusy(true); setFailed(false);
            const ok = await attempt(async () => {
              if (target === "session") { await attendanceService.remove(poll.id); store.removePoll(poll.id); }
              else store.receivePoll(await attendanceService.removeSlot(poll.id, target));
              await store.sync();
            }, copy(target === "session" ? "Séance supprimée." : "Créneau retiré."));
            setBusy(false);
            if (ok) { if (target === "session") close(); else setTarget(null); } else setFailed(true);
          }}>{busy ? copy("Suppression…") : copy("Confirmer la suppression")}</Button></div>
      </section>}
      {failed && <p className="error" role="alert">{copy("La suppression n’a pas pu être confirmée. Actualisez la liste avant de réessayer.")}</p>}
      <Button variant="secondary" disabled={busy || adding} onClick={close}>{copy("Fermer")}</Button>
    </div>
  </Modal>;
}
