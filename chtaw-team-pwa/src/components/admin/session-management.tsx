"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { attendanceService } from "@/services/attendance.service";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { attempt } from "@/components/shared";
import type { Poll } from "@/types";
import styles from "./session-management.module.css";

export function SessionManagement({ poll, close }: { poll: Poll; close: () => void }) {
  const store = useCommunity();
  const { text: copy, locale } = useCopy();
  const [target, setTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const option = poll.options.find((slot) => slot.id === target);
  const actor = store.users.find((user) => user.id === store.session?.userId);
  if (actor?.role !== "ADMIN" || poll.type !== "SESSION") return null;
  return <Modal open title={copy("Gérer la séance")} onClose={() => { if (!busy) close(); }}>
    <div className={`form-stack ${styles.management}`}>
      <h3>{poll.question}</h3>
      <ul className={styles.slots}>{poll.options.map((slot) => <li key={slot.id}>
        <div><strong>{slot.label}</strong>{slot.startsAt && <p>{new Date(slot.startsAt).toLocaleString(locale, { timeZone: "Africa/Tunis", dateStyle: "medium", timeStyle: "short" })}</p>}</div>
        <Button size="sm" variant="destructive" disabled={busy || poll.options.length <= 1} aria-label={copy("Retirer le créneau : {slot}", { slot: slot.label })} onClick={() => { setTarget(slot.id); setFailed(false); }}><Trash2 size={14} aria-hidden="true" />{copy("Retirer")}</Button>
      </li>)}</ul>
      {poll.options.length <= 1 && <p className="small muted">{copy("Pour retirer le dernier créneau, supprimez la séance.")}</p>}
      {!target && <Button variant="destructive" disabled={busy} onClick={() => { setTarget("session"); setFailed(false); }}><Trash2 size={15} aria-hidden="true" />{copy("Supprimer la séance")}</Button>}
      {target && <section className={styles.confirmation} aria-label={copy("Confirmation de suppression")}>
        <h4>{target === "session" ? copy("Supprimer définitivement cette séance ?") : copy("Retirer ce créneau ?")}</h4>
        {option && <p><strong>{option.label}</strong></p>}
        <p className="small">{copy(target === "session" ? "La séance, tous ses créneaux, ses votes et ses pointages seront supprimés. Les compteurs seront recalculés. Cette action est irréversible." : "Les votes et pointages liés à ce créneau seront supprimés. Les autres créneaux seront conservés et les compteurs recalculés.")}</p>
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
      <Button variant="secondary" disabled={busy} onClick={close}>{copy("Fermer")}</Button>
    </div>
  </Modal>;
}
