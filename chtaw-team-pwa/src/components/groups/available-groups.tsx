"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { groupsService, type AvailableGroup } from "@/services/groups.service";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import styles from "./join-requests.module.css";

export function AvailableGroups() {
  const actor = useCommunity((state) => state.users.find((user) => user.id === state.session?.userId));
  if (!actor || actor.status !== "APPROVED" || !["USER", "COLLABORATOR"].includes(actor.role)) return null;
  return <Directory key={actor.id} owner={actor.id} />;
}

function Directory({ owner }: { owner: string }) {
  const { t, error: failure } = useCopy();
  const [groups, setGroups] = useState<AvailableGroup[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const pending = useRef(false);
  const memberIds = useCommunity((state) => state.groups.map((group) => group.id).join(","));
  const load = useCallback(async () => {
    try {
      const next = await groupsService.directory();
      if (useCommunity.getState().session?.userId !== owner) return;
      setGroups(next); setError("");
    } catch (reason) {
      if (useCommunity.getState().session?.userId === owner)
        setError(reason instanceof Error ? reason.message : "Opération impossible.");
    }
  }, [owner]);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) return load(); });
    const timer = setInterval(() => void load(), 30000);
    return () => { active = false; clearInterval(timer); };
  }, [load, memberIds]);
  const available = groups?.filter((group) => !group.isGeneral && !group.isMember);
  return <section className={styles.directory} aria-label={t("Groupes disponibles")}>
    <h2 className="list-caption">{t("Groupes disponibles")}</h2>
    <p className="tiny muted">{t("Seuls les noms sont visibles. L’admin doit accepter votre demande pour accéder au contenu.")}</p>
    {error && <div role="alert"><p className="error">{failure(error)}</p><Button size="sm" variant="ghost" onClick={() => void load()}>{t("Réessayer")}</Button></div>}
    {!groups && !error && <p role="status" className="small muted">{t("Chargement…")}</p>}
    {available?.length === 0 && <p className="small muted">{t("Aucun autre groupe disponible.")}</p>}
    {available?.map((group) => <div key={group.id} className={styles.card}>
      <strong><LockKeyhole size={15} aria-hidden="true" /> {group.name}</strong>
      {group.requestStatus ? <p className="tiny" role="status">{t(group.requestStatus === "PENDING" ? "Demande en attente" : group.requestStatus === "REJECTED" ? "Demande refusée" : "Demande déjà acceptée")}</p> :
        <Button size="sm" variant="secondary" disabled={busy !== null} aria-label={t("Demander à rejoindre {group}", { group: group.name })} onClick={async () => {
          if (pending.current) return;
          pending.current = true; setBusy(group.id); setError("");
          try {
            await groupsService.requestJoin(group.id);
            if (useCommunity.getState().session?.userId === owner)
              setGroups((previous) => previous?.map((item) => item.id === group.id ? { ...item, requestStatus: "PENDING" } : item));
          } catch (reason) {
            if (useCommunity.getState().session?.userId === owner)
              setError(reason instanceof Error ? reason.message : "Opération impossible.");
          } finally { pending.current = false; setBusy(null); }
        }}>{t(busy === group.id ? "Envoi…" : "Demander à rejoindre")}</Button>}
    </div>)}
    <p className="tiny muted">{t("Une seule demande par groupe, même après un refus.")}</p>
  </section>;
}
