import type { DemoData, User, Group, Message, Poll } from "@/types";
export function approved(user?: User) {
  if (!user || user.status !== "APPROVED")
    throw Error("Ce compte ne peut pas accéder à la messagerie.");
  return user;
}
export function admin(user?: User) {
  if (approved(user).role !== "ADMIN") throw Error("Action réservée à l’administrateur.");
}
export function access(user: User | undefined, group?: Group) {
  const actor = approved(user);
  if (!group || (actor.role !== "ADMIN" && !group.memberIds.includes(actor.id)))
    throw Error("Vous ne faites pas partie de ce groupe.");
  return actor;
}
export function review(
  data: DemoData,
  actor: User | undefined,
  id: string,
  status: "APPROVED" | "REJECTED",
): DemoData {
  admin(actor);
  const target = data.users.find((u) => u.id === id);
  if (!target || target.status !== "PENDING") throw Error("Cette demande a déjà été traitée.");
  return {
    ...data,
    users: data.users.map((u) => (u.id === id ? { ...u, status } : u)),
    groups: data.groups.map((g) =>
      g.isGeneral && status === "APPROVED"
        ? { ...g, memberIds: [...new Set([...g.memberIds, id])] }
        : g,
    ),
  };
}
export function membership(
  data: DemoData,
  actor: User | undefined,
  groupId: string,
  userId: string,
  add: boolean,
): DemoData {
  admin(actor);
  const group = data.groups.find((g) => g.id === groupId);
  if (!group || group.isGeneral)
    throw Error("Les membres du groupe général sont gérés automatiquement.");
  approved(data.users.find((u) => u.id === userId));
  return {
    ...data,
    groups: data.groups.map((g) =>
      g.id === groupId
        ? {
            ...g,
            memberIds: add
              ? [...new Set([...g.memberIds, userId])]
              : g.memberIds.filter((id) => id !== userId),
          }
        : g,
    ),
  };
}
export function post(data: DemoData, actor: User | undefined, message: Message): DemoData {
  const user = access(
    actor,
    data.groups.find((g) => g.id === message.groupId),
  );
  if (message.authorId !== user.id || message.kind === "system")
    throw Error("Expéditeur invalide.");
  if (message.kind !== "text") admin(user);
  if (message.kind === "text" && (!message.text.trim() || message.text.length > 4000))
    throw Error("Le message doit contenir entre 1 et 4 000 caractères.");
  return { ...data, messages: [...data.messages, message] };
}
export function publishPoll(data: DemoData, actor: User | undefined, poll: Poll): DemoData {
  admin(actor);
  access(
    actor,
    data.groups.find((g) => g.id === poll.groupId),
  );
  if (
    !poll.question.trim() ||
    poll.options.length < 2 ||
    poll.options.some((o) => !o.label.trim()) ||
    new Set(poll.options.map((o) => o.label.trim().toLowerCase())).size !== poll.options.length
  )
    throw Error("Ajoutez une question et au moins deux réponses différentes.");
  if (poll.endsAt && Date.parse(poll.endsAt) <= Date.now())
    throw Error("La date de fin doit être dans le futur.");
  return { ...data, polls: [...data.polls, poll] };
}
export function vote(
  data: DemoData,
  actor: User | undefined,
  pollId: string,
  optionIds: string[],
): DemoData {
  const poll = data.polls.find((p) => p.id === pollId);
  if (!poll) throw Error("Sondage introuvable.");
  const user = access(
    actor,
    data.groups.find((g) => g.id === poll.groupId),
  );
  if (poll.votes.some((v) => v.userId === user.id)) throw Error("Vous avez déjà participé.");
  if (poll.endsAt && Date.parse(poll.endsAt) <= Date.now()) throw Error("Ce sondage est terminé.");
  if (
    !optionIds.length ||
    new Set(optionIds).size !== optionIds.length ||
    (poll.singleChoice && optionIds.length !== 1) ||
    optionIds.some((id) => !poll.options.some((o) => o.id === id))
  )
    throw Error("Sélectionnez une réponse valide.");
  return {
    ...data,
    polls: data.polls.map((p) =>
      p.id === pollId ? { ...p, votes: [...p.votes, { userId: user.id, optionIds }] } : p,
    ),
  };
}
