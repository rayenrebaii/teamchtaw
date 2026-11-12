"use client";
import { useRef, useState } from "react";
import { Ban, Check, UserPlus } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { usersService } from "@/services/users.service";
import { groupsService } from "@/services/groups.service";
import { runSelectedActions } from "@/features/bulk-actions";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import type { User } from "@/types";
import styles from "./bulk-actions.module.css";

export function MemberBulkActions({ selected, onDone, clear, onBusy }: {
  selected: User[]; onDone: (ids: string[]) => void; clear: () => void; onBusy: (busy: boolean) => void;
}) {
  const { t, error: failure } = useCopy();
  const store = useCommunity();
  const owner = store.session?.userId;
  const [action, setAction] = useState<"accept" | "ban" | "group" | null>(null);
  const [groupId, setGroupId] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [report, setReport] = useState<{ count: number; errors: { name: string; error: string }[] }>();
  const approved = selected.filter((user) => user.status === "APPROVED" && user.role !== "ADMIN");
  const waiting = selected.filter((user) => user.status === "PENDING" && user.role === "USER");
  const group = store.groups.find((item) => item.id === groupId && !item.isGeneral);
  const targets = action === "accept" ? waiting : action === "group" ? approved.filter((user) => !group?.memberIds.includes(user.id)) : approved;
  const title = action === "accept" ? "Accepter les membres sélectionnés" : action === "ban" ? "Bannir les membres sélectionnés" : "Ajouter les membres sélectionnés au groupe";
  if (!store.users.some((user) => user.id === owner && user.role === "ADMIN")) return null;
  return <>
    <div className={styles.toolbar} aria-label={t("Actions sur les membres sélectionnés")}>
      <strong>{t("{count} sélectionné(s)", { count: selected.length })}</strong>
      <div className="row wrap">
        <Button size="sm" disabled={busy || !waiting.length} onClick={() => { setReport(undefined); setAction("accept"); }}><Check size={15} />{t("Accepter")} ({waiting.length})</Button>
        <Button size="sm" variant="secondary" disabled={busy || !approved.length} onClick={() => { setReport(undefined); setGroupId(""); setAction("group"); }}><UserPlus size={15} />{t("Ajouter au groupe")} ({approved.length})</Button>
        <Button size="sm" variant="destructive" disabled={busy || !approved.length} onClick={() => { setReport(undefined); setAction("ban"); }}><Ban size={15} />{t("Bannir")} ({approved.length})</Button>
        <Button size="sm" variant="ghost" disabled={busy || !selected.length} onClick={clear}>{t("Effacer la sélection")}</Button>
      </div>
      <p className="tiny muted">{t("Les actions concernent uniquement les membres éligibles de la sélection. La sélection est conservée entre les pages et effacée lors d’un changement de filtre.")}</p>
    </div>
    {report && <div className={styles.report}>
      <p role="status">{t("{count} opération(s) réussie(s)", { count: report.count })}</p>
      {!!report.errors.length && <div role="alert"><p>{t("Les éléments en échec restent sélectionnés.")}</p><ul>{report.errors.map((item) => <li key={item.name}>{item.name} : {failure(item.error)}</li>)}</ul></div>}
    </div>}
    {action && <Modal open title={t(title)} onClose={() => { if (!busy) setAction(null); }}>
      <div className="form-stack">
        {action === "ban" && <p className="error">{t("Le compte et ses données associées seront définitivement supprimés. Le membre sera retiré de tous les groupes et ses sessions seront déconnectées. Cette action est irréversible.")}</p>}
        {action === "accept" && <p>{t("Les clients en attente seront approuvés et ajoutés au groupe général. Les invitations des collaborateurs conservent leur fonctionnement actuel.")}</p>}
        {action === "group" && <label>{t("Groupe de destination")}<select required value={groupId} disabled={busy} onChange={(event) => setGroupId(event.target.value)}>
          <option value="">{t("Choisir un groupe")}</option>{store.groups.filter((item) => !item.isGeneral).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>}
        <p>{t("{count} membre(s) concerné(s)", { count: targets.length })}</p>
        <ul className={styles.targets}>{targets.map((user) => <li key={user.id}><strong>{user.firstName} {user.lastName}</strong><span className="small muted">{user.email}</span></li>)}</ul>
        {action === "group" && group && targets.length === 0 && <p role="status">{t("Les membres sélectionnés appartiennent déjà à ce groupe.")}</p>}
        <div className="row wrap"><Button variant="secondary" disabled={busy} onClick={() => setAction(null)}>{t("Annuler")}</Button>
          <Button variant={action === "ban" ? "destructive" : "default"} disabled={busy || !targets.length || (action === "group" && !group)} onClick={async () => {
            if (pending.current) return;
            pending.current = true; setBusy(true); onBusy(true);
            const currentAction = action;
            try {
              const outcome = await runSelectedActions([...targets], async (user) => {
                if (currentAction === "accept") await usersService.review(user.id, "APPROVED");
                else if (currentAction === "ban") { await usersService.ban(user.id); if (useCommunity.getState().session?.userId === owner) useCommunity.getState().removeUser(user.id); }
                else { const saved = await groupsService.member(groupId, user.id, true); if (useCommunity.getState().session?.userId === owner) useCommunity.getState().receiveGroup(saved); }
              }, () => useCommunity.getState().session?.userId === owner && useCommunity.getState().users.some((user) => user.id === owner && user.role === "ADMIN"));
              if (useCommunity.getState().session?.userId !== owner) return;
              onDone(outcome.succeeded);
              setReport({ count: outcome.succeeded.length, errors: outcome.failed.map(({ item, error }) => ({ name: `${item.firstName} ${item.lastName} (${item.email})`, error })) });
              setAction(null);
              await useCommunity.getState().sync();
            } finally { pending.current = false; setBusy(false); onBusy(false); }
          }}>{busy ? t("Traitement…") : t("Confirmer pour {count} membre(s)", { count: targets.length })}</Button></div>
      </div>
    </Modal>}
  </>;
}
