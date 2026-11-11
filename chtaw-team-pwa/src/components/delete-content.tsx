"use client";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { messagesService } from "@/services/messages.service";
import { pollsService } from "@/services/polls.service";
import { useCopy } from "@/lib/i18n";
import { attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { Message, Poll } from "@/types";

export function DeleteContent({ poll, message }: { poll?: Poll; message?: Message }) {
  const store = useCommunity();
  const { t } = useCopy();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const allowed = actor?.role === "ADMIN" || (!!poll && actor?.role === "COLLABORATOR" && poll.authorId === actor.id);
  if (!allowed || (!poll && !message)) return null;
  const label = t(poll ? "Supprimer le sondage" : "Supprimer le message");
  return <>
    <Button size="sm" variant="destructive" aria-label={poll ? `${label} : ${poll.question}` : label} onClick={() => setOpen(true)}>
      <Trash2 size={14} aria-hidden="true" />{label}
    </Button>
    {open && <Modal open title={label} onClose={() => { if (!busy) setOpen(false); }}>
      {poll && <p><strong>{poll.question}</strong></p>}
      <p>{t(poll?.type === "SESSION"
        ? "Suppression possible jusqu’à deux heures avant le premier créneau, ou après la fin de tous les créneaux et la validation de toutes les présences. Les présences, absences et leur historique seront conservés."
        : poll ? "Le sondage et ses votes seront définitivement supprimés." : "Ce message sera définitivement supprimé pour tous les membres du groupe.")}</p>
      <div className="row wrap">
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>{t("Annuler")}</Button>
        <Button variant="destructive" disabled={busy} onClick={async () => {
          if (busy) return;
          setBusy(true);
          const ok = await attempt(async () => {
            if (poll) { await pollsService.remove(poll.id); store.removePoll(poll.id); }
            else if (message) { await messagesService.remove(message.groupId, message.id); store.removeMessage(message.id); }
          }, t(poll ? "Sondage supprimé." : "Message supprimé."));
          setBusy(false);
          if (ok) setOpen(false);
        }}>{t(busy ? "Suppression…" : "Confirmer la suppression")}</Button>
      </div>
    </Modal>}
  </>;
}
