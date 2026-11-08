"use client";
import { useState } from "react";
import { UserMinus } from "lucide-react";
import { useCommunity } from "@/stores/community";
import { useCopy } from "@/lib/i18n";
import { Avatar, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import type { Group } from "@/types";

export function GroupMembers({ group }: { group: Group }) {
  const { text: copy } = useCopy();
  const store = useCommunity();
  const { t } = useCopy();
  const actor = store.users.find((u) => u.id === store.session?.userId);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const history = store.history[group.id];
  return (
    <section aria-label={t("Membres du groupe")}>
      <h3>{t("Membres ({count})", { count: group.memberIds.length })}</h3>
      {history?.loading && !history.loaded && (
        <p role="status" className="small muted">
          {t("Chargement des membres…")}
        </p>
      )}
      {history?.error && (
        <div role="alert">
          <p className="small error">{t("La liste des membres n’a pas pu être actualisée.")}</p>
          <Button variant="secondary" onClick={() => void store.loadHistory(group.id)}>
            {t("Réessayer")}
          </Button>
        </div>
      )}
      <div className="member-list">
        {group.memberIds.map((id) => {
          const member =
            store.people.find((u) => u.id === id) ?? store.users.find((u) => u.id === id);
          const name = member ? `${member.firstName} ${member.lastName}` : t("Membre");
          return (
            <div className="conversation-member" key={id}>
              <div className="row">
                <Avatar user={member} />
                <div className="conversation-member-name">
                  <strong>{name}</strong>
                  <p className="tiny muted">
                    {member?.role === "ADMIN" ? t("Administrateur · Retrait protégé") : t("Membre")}
                  </p>
                </div>
                {!group.isGeneral &&
                  actor?.role === "ADMIN" &&
                  member?.role === "USER" &&
                  confirmId !== id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={removing}
                      aria-label={`Retirer ${name} du groupe`}
                      onClick={() => setConfirmId(id)}
                    >
                      <UserMinus size={15} /> {copy("Retirer")}{" "}
                    </Button>
                  )}
              </div>
              {!group.isGeneral &&
                actor?.role === "ADMIN" &&
                member?.role === "USER" &&
                confirmId === id && (
                  <div className="member-removal-confirmation">
                    <p className="small">
                      {copy("Retirer")} {name} {copy("de «")} {group.name}{" "}
                      {copy("» ? Son compte sera conservé.")}{" "}
                    </p>
                    <div className="row">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={removing}
                        onClick={() => setConfirmId(null)}
                      >
                        {copy("Annuler")}{" "}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={removing}
                        onClick={async () => {
                          if (removing) return;
                          setRemoving(true);
                          try {
                            const ok = await attempt(
                              () => store.membership(group.id, id, false),
                              copy("Membre retiré du groupe."),
                            );
                            if (ok) setConfirmId(null);
                          } finally {
                            setRemoving(false);
                          }
                        }}
                      >
                        {removing ? copy("Retrait en cours…") : copy("Confirmer le retrait")}
                      </Button>
                    </div>
                  </div>
                )}
            </div>
          );
        })}
        {!group.memberIds.length && (
          <p className="small muted">{t("Aucun membre dans ce groupe.")}</p>
        )}
      </div>
    </section>
  );
}
