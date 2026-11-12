"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { groupsService, type GroupJoinRequest } from "@/services/groups.service";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import styles from "./join-requests.module.css";

export function GroupJoinRequests() {
  const actor = useCommunity((state) => state.users.find((user) => user.id === state.session?.userId));
  if (actor?.role !== "ADMIN") return null;
  return <Requests key={actor.id} owner={actor.id} />;
}

function Requests({ owner }: { owner: string }) {
  const { t, locale, error: failure } = useCopy();
  const [requests, setRequests] = useState<GroupJoinRequest[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const load = useCallback(async () => {
    try {
      const next = await groupsService.joinRequests();
      if (useCommunity.getState().session?.userId !== owner) return;
      setRequests(next); setError("");
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
  }, [load]);
  async function review(id: string, status: "APPROVED" | "REJECTED") {
    if (pending.current) return;
    pending.current = true; setBusy(id); setError(""); setMessage("");
    try {
      await groupsService.reviewJoinRequest(id, status);
      if (useCommunity.getState().session?.userId !== owner) return;
      setRequests((previous) => previous?.filter((item) => item.id !== id));
      setMessage(status === "APPROVED" ? "Demande acceptée. Le membre peut accéder au groupe." : "Demande refusée.");
      await useCommunity.getState().sync();
    } catch (reason) {
      if (useCommunity.getState().session?.userId === owner)
        setError(reason instanceof Error ? reason.message : "Opération impossible.");
    } finally { pending.current = false; setBusy(null); }
  }
  return <section className={`panel ${styles.requests}`} aria-label={t("Demandes d’adhésion aux groupes")}>
    <div className="row wrap between"><h2>{t("Demandes d’adhésion aux groupes")}{requests ? ` (${requests.length})` : ""}</h2>
      <Button variant="secondary" size="sm" disabled={busy !== null} onClick={() => void load()}>{t("Actualiser")}</Button></div>
    <p className="small muted">{t("Clients et collaborateurs attendent votre décision pour accéder à ces groupes.")}</p>
    {error && <p className="error" role="alert">{failure(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    {!requests && !error && <p role="status">{t("Chargement…")}</p>}
    {requests?.length === 0 && <p className="muted">{t("Aucune demande d’adhésion en attente.")}</p>}
    {requests?.map((request) => <article key={request.id} className={styles.request} aria-label={`${request.user.firstName} ${request.user.lastName} · ${request.group.name}`}>
      <div><strong>{request.user.firstName} {request.user.lastName}</strong><p className="small">{request.user.email}</p>
        <p className="small muted">{t(request.user.role === "COLLABORATOR" ? "Collaborateur" : "Client")} · {request.group.name}</p>
        <time className="tiny muted" dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleString(locale)}</time></div>
      <div className="row wrap"><Button size="sm" disabled={busy !== null} onClick={() => void review(request.id, "APPROVED")}>{t("Accepter")}</Button>
        <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => void review(request.id, "REJECTED")}>{t("Refuser")}</Button></div>
    </article>)}
  </section>;
}
