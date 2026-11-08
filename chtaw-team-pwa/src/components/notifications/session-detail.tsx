"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { attendanceService, type PersonalAttendancePage } from "@/services/attendance.service";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
export function SessionDetail({ sessionId }: { sessionId: string }) {
  const owner = useCommunity((state) => state.session?.userId);
  const polls = useCommunity((state) => state.polls);
  const { t, locale, error } = useCopy();
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    owner: string;
    id: string;
    page?: PersonalAttendancePage;
    error?: string;
  }>();
  useEffect(() => {
    if (!owner) return;
    let active = true;
    void attendanceService
      .mine({ pollId: sessionId })
      .then((page) => {
        if (page.user.id !== owner) throw Error("La session a changé.");
        if (active) setResult({ owner, id: sessionId, page });
      })
      .catch((reason: unknown) => {
        if (active)
          setResult({
            owner,
            id: sessionId,
            error: reason instanceof Error ? reason.message : "Une erreur est survenue.",
          });
      });
    return () => {
      active = false;
    };
  }, [owner, sessionId, revision, polls]);
  const current = result && result.owner === owner && result.id === sessionId ? result : undefined;
  const session = current?.page?.items.find((item) => item.id === sessionId);
  return (
    <div className="account-page">
      <Button asChild variant="secondary">
        <Link href="/app/attendance">{t("Retour aux présences")}</Link>
      </Button>
      {!current && <p role="status">{t("Chargement…")}</p>}
      {current?.error && (
        <div role="alert">
          <p>{error(current.error)}</p>
          <Button onClick={() => setRevision((value) => value + 1)}>{t("Réessayer")}</Button>
        </div>
      )}
      {current?.page && !session && <p role="status">{t("Contenu indisponible.")}</p>}
      {session && (
        <section className="panel">
          <span className="eyebrow">{session.groupName}</span>
          <h1>{session.question}</h1>
          <p>{session.description}</p>
          {session.status === "CANCELLED" && <p role="status">{t("Annulée")}</p>}
          <ul className="notification-list">
            {session.slots.map((slot) => (
              <li key={slot.optionId}>
                <strong>{slot.label}</strong>
                {slot.startsAt && (
                  <p>
                    <time dateTime={slot.startsAt}>
                      {new Date(slot.startsAt).toLocaleString(locale)}
                    </time>
                    {slot.endsAt && (
                      <>
                        {" "}
                        —{" "}
                        <time dateTime={slot.endsAt}>
                          {new Date(slot.endsAt).toLocaleString(locale)}
                        </time>
                      </>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Button asChild>
            <Link href={"/app/groups/" + session.groupId + "?poll=" + session.id}>
              {t("Ouvrir la conversation")}
            </Link>
          </Button>
        </section>
      )}
    </div>
  );
}
