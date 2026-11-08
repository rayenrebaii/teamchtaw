"use client";
import { useState } from "react";
import { Check, Search, UserPlus } from "lucide-react";
import { Avatar, attempt } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { defaultRequestFilters, filterRequests } from "@/features/requests";
import { useCopy } from "@/lib/i18n";
import { useCommunity } from "@/stores/community";
import type { Group } from "@/types";
import styles from "./add-group-members.module.css";

export function AddGroupMembers({ group, close }: { group: Group; close: () => void }) {
  const store = useCommunity();
  const { text: copy } = useCopy();
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const actor = store.users.find((user) => user.id === store.session?.userId);
  const candidates = filterRequests(store.users, { ...defaultRequestFilters, status: "APPROVED", search });
  if (actor?.role !== "ADMIN" || group.isGeneral) return null;
  return (
    <Modal open onClose={() => { if (!busy) close(); }} title={copy("Ajouter des membres au groupe")}>
      <div className={`form-stack ${styles.picker}`}>
        <p className="muted">{copy("Groupe")} : <strong>{group.name}</strong></p>
        <label>
          {copy("Rechercher par nom, prénom ou email")}
          <span className="request-search-input">
            <Search size={17} aria-hidden="true" />
            <input type="search" maxLength={254} placeholder={copy("Nom, prénom ou email…")}
              value={search} onChange={(event) => setSearch(event.target.value)} />
          </span>
        </label>
        {store.loading && <p className="small muted" role="status">{copy("Actualisation des utilisateurs…")}</p>}
        {store.syncErrors.users && (
          <div role="alert">
            <p className="error">{copy("La liste n’a pas pu être actualisée :")} {copy(store.syncErrors.users)}</p>
            <Button variant="secondary" size="sm" disabled={store.loading || !!busy} onClick={() => void store.sync()}>{copy("Réessayer")}</Button>
          </div>
        )}
        <ul className={styles.list} aria-label={copy("Utilisateurs approuvés")} aria-busy={store.loading}>
          {candidates.map((member) => {
            const assigned = group.memberIds.includes(member.id);
            const name = `${member.firstName} ${member.lastName}`;
            return (
              <li key={member.id} className={styles.member}>
                <div className={styles.identity}>
                  <Avatar user={member} size="small-avatar" />
                  <div><strong>{name}</strong><span className="group-member-email">{member.email}</span></div>
                </div>
                {assigned ? (
                  <span className={styles.assigned}><Check size={14} aria-hidden="true" />{copy("Déjà membre")}</span>
                ) : (
                  <Button size="sm" disabled={!!busy || store.loading} aria-label={copy("Ajouter {name} au groupe", { name })}
                    onClick={async () => {
                      if (busy) return;
                      setBusy(member.id);
                      setAddError(null);
                      const saved = await attempt(() => store.membership(group.id, member.id, true), copy("Membre ajouté au groupe."));
                      if (!saved) setAddError(copy("L’ajout a échoué. Réessayez sans quitter la liste."));
                      setBusy(null);
                    }}>
                    <UserPlus size={15} aria-hidden="true" />{busy === member.id ? copy("Ajout…") : copy("Ajouter")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        {!candidates.length && !store.loading && !store.syncErrors.users && <p className="small muted" role="status">{copy("Aucun utilisateur approuvé ne correspond à votre recherche.")}</p>}
        {addError && <p className="error" role="alert">{addError}</p>}
        <Button variant="secondary" disabled={!!busy} onClick={close}>{copy("Fermer")}</Button>
      </div>
    </Modal>
  );
}
