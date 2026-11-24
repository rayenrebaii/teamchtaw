"use client";
import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { pollsService } from "@/services/polls.service";
import { runSelectedActions } from "@/features/bulk-actions";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { Poll } from "@/types";
import styles from "./bulk-actions.module.css";

export function PollBulkDelete({ selected, onDone, onBusy }: {
  selected: Poll[]; onDone: (ids: string[]) => void; onBusy: (busy: boolean) => void;
}) {
  const { t, error: failure } = useCopy();
  const [targets, setTargets] = useState<Poll[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [report, setReport] = useState<{ count: number; errors: { id: string; name: string; error: string }[] }>();
  const owner = useCommunity(state => state.session?.userId);
  const allowed = (poll: Poll) => {
    const state = useCommunity.getState();
    const actor = state.users.find(user => user.id === owner);
    return state.session?.userId === owner && (actor?.role === "ADMIN" || (actor?.role === "COLLABORATOR" && poll.authorId === owner));
  };
  const eligible = selected.filter(allowed);
  return <>
    <Button size="sm" variant="destructive" disabled={busy || !eligible.length} onClick={() => { setReport(undefined); setTargets([...eligible]); }}>
      <Trash2 size={15} aria-hidden="true" />{t("Supprimer la sélection")} ({eligible.length})
    </Button>
    {report && <div className={styles.report}>
      <p role="status">{t("{count} opération(s) réussie(s)", { count: report.count })}</p>
      {!!report.errors.length && <div role="alert"><p>{t("Les éléments en échec restent sélectionnés.")}</p><ul>{report.errors.map(item => <li key={item.id}>{item.name} : {failure(item.error)}</li>)}</ul></div>}
    </div>}
    {targets && <Modal open title={t("Supprimer les sondages sélectionnés")} onClose={() => { if (!pending.current) setTargets(null); }}>
      <p className="error">{t("Les sondages sélectionnés et leurs votes seront définitivement supprimés. Pour les séances, tous les créneaux, présences, absences et historiques associés seront supprimés et les compteurs recalculés. Cette action est irréversible.")}</p>
      <ul className={styles.targets}>{targets.map(poll => <li key={poll.id}>{poll.question}</li>)}</ul>
      <div className="row wrap">
        <Button variant="secondary" disabled={busy} onClick={() => setTargets(null)}>{t("Annuler")}</Button>
        <Button variant="destructive" disabled={busy || !targets.length} onClick={async () => {
          if (pending.current) return;
          pending.current = true; setBusy(true); onBusy(true);
          try {
            const outcome = await runSelectedActions(targets, async poll => {
              if (!allowed(poll)) throw Error("Opération impossible.");
              await pollsService.remove(poll.id);
              if (useCommunity.getState().session?.userId === owner) useCommunity.getState().removePoll(poll.id);
            }, () => useCommunity.getState().session?.userId === owner);
            if (useCommunity.getState().session?.userId !== owner) return;
            onDone(outcome.succeeded);
            setReport({ count: outcome.succeeded.length, errors: outcome.failed.map(({ item, error }) => ({ id: item.id, name: item.question, error })) });
            setTargets(null);
          } finally { pending.current = false; setBusy(false); onBusy(false); }
        }}>{t(busy ? "Suppression…" : "Confirmer la suppression")} ({targets.length})</Button>
      </div>
    </Modal>}
  </>;
}
