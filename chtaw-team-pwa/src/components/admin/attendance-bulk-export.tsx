"use client";
import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { attendanceService, type Roster } from "@/services/attendance.service";
import { attendanceCsv } from "@/features/attendance-export";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

export function AttendanceBulkExport({ selected, onBusy }: { selected: string[]; onBusy: (busy: boolean) => void }) {
  const { t, locale, error: failure } = useCopy();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const pending = useRef(false);
  return <>
    <Button size="sm" disabled={busy || !selected.length} onClick={async () => {
      if (pending.current) return;
      pending.current = true; setBusy(true); onBusy(true); setError(""); setDone(false);
      const owner = useCommunity.getState().session?.userId;
      const check = () => {
        const state = useCommunity.getState();
        const actor = state.users.find(user => user.id === owner);
        if (!owner || state.session?.userId !== owner || !actor || !["ADMIN", "COLLABORATOR"].includes(actor.role)) throw Error("La session a changé.");
      };
      try {
        const sessions = new Map<string, string[]>();
        for (const id of selected) {
          const [sessionId, optionId] = id.split(":");
          if (!sessionId || !optionId) throw Error("Export impossible. Veuillez réessayer.");
          sessions.set(sessionId, [...(sessions.get(sessionId) || []), optionId]);
        }
        const lists: { roster: Roster; optionIds: string[] }[] = [];
        for (const [id, optionIds] of sessions) {
          check();
          lists.push({ roster: await attendanceService.roster(id), optionIds });
        }
        check();
        const file = new Blob([attendanceCsv(lists, locale, t)], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = url; link.download = "chtaw-team-attendance.csv";
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setDone(true);
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Export impossible. Veuillez réessayer."); }
      finally { pending.current = false; setBusy(false); onBusy(false); }
    }}><Download size={15} aria-hidden="true" />{t(busy ? "Export en cours…" : "Exporter les listes sélectionnées")} ({selected.length})</Button>
    {error && <p className="small error" role="alert">{failure(error)}</p>}
    {done && <p className="small muted" role="status">{t("Export téléchargé.")}</p>}
  </>;
}
