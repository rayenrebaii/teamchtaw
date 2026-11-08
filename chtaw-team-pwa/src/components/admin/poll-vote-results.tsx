"use client";
import { Users, UserRoundX } from "lucide-react";
import { Avatar } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/i18n";
import { pollVoteLists } from "@/features/poll-votes";
import { useCommunity } from "@/stores/community";
import type { Poll } from "@/types";
import styles from "./poll-vote-results.module.css";

export function PollVoteResults({ poll }: { poll: Poll }) {
  const store = useCommunity();
  const { text: copy, locale } = useCopy();
  const group = store.groups.find((candidate) => candidate.id === poll.groupId);
  const { choices, voterCount, nonVoters } = pollVoteLists(poll, group, store.users);
  const incomplete = !!store.syncErrors.users || !!store.syncErrors.groups || !!store.syncErrors.polls || !group;
  const person = (userId: string) => {
    const member = store.users.find((user) => user.id === userId);
    return (
      <li key={userId} className={styles.person}>
        <Avatar user={member} size="small-avatar" />
        <div><strong>{member ? `${member.firstName} ${member.lastName}` : copy("Compte indisponible")}</strong>
          {member && <span>{member.email}</span>}
        </div>
      </li>
    );
  };
  return (
    <div className={styles.results} aria-busy={store.loading}>
      <h3>{poll.question}</h3>
      {poll.description && <p>{poll.description}</p>}
      <p className="small muted">{copy("{count} votant(s)", { count: voterCount })} · {copy(poll.singleChoice ? "Une seule réponse" : "Plusieurs réponses possibles")}</p>
      {store.loading && <p className="small muted" role="status">{copy("Actualisation des votes et des membres…")}</p>}
      {incomplete && <div className="request-error" role="alert">
        <p>{copy("Les résultats ou la liste des membres n’ont pas pu être actualisés. Les informations affichées peuvent être incomplètes.")}</p>
        <Button size="sm" variant="secondary" disabled={store.loading} onClick={() => void store.sync()}>{copy("Réessayer")}</Button>
      </div>}
      {choices.map((choice) => (
        <section key={choice.id} className={styles.section} aria-label={choice.label}>
          <h4><span>{choice.label}</span><span className="badge">{choice.voterIds.length}</span></h4>
          {choice.startsAt && <p className="small muted"><time dateTime={choice.startsAt}>{new Date(choice.startsAt).toLocaleString(locale)}</time>{choice.endsAt && <> → <time dateTime={choice.endsAt}>{new Date(choice.endsAt).toLocaleString(locale)}</time></>}</p>}
          {choice.voterIds.length ? <ul className={styles.list} aria-label={copy("Votants pour {choice}", { choice: choice.label })}>{choice.voterIds.map(person)}</ul>
            : <p className="small muted">{copy("Aucun vote pour ce choix.")}</p>}
        </section>
      ))}
      <section className={styles.section} aria-label={copy("Membres sans vote")}>
        <h4><span><UserRoundX size={17} aria-hidden="true" />{copy("Membres sans vote")}</span>{!incomplete && <span className="badge">{nonVoters?.length ?? 0}</span>}</h4>
        <p className="small muted">{copy(poll.type === "SESSION" ? "Étudiants actuels du groupe qui n’ont choisi aucun créneau." : "Membres actuels du groupe qui n’ont sélectionné aucun choix.")}</p>
        {incomplete ? <p className="small muted">{copy("Actualisez les données pour obtenir la liste complète.")}</p>
          : nonVoters?.length ? <ul className={styles.list}>{nonVoters.map((member) => person(member.id))}</ul>
            : <p className={styles.complete}><Users size={16} aria-hidden="true" />{copy("Tous les membres du groupe ont voté.")}</p>}
      </section>
    </div>
  );
}
