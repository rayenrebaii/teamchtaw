import { Prisma } from "@prisma/client";
export const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  bio: true,
  role: true,
} satisfies Prisma.UserSelect;
export const messageInclude = { author: { select: memberSelect } } satisfies Prisma.MessageInclude;
export const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  bio: true,
  role: true,
  status: true,
  joinedAt: true,
} satisfies Prisma.UserSelect;
export const groupInclude = { members: { select: { userId: true } } } satisfies Prisma.GroupInclude;
export const pollInclude = {
  options: { orderBy: { position: "asc" } },
  votes: { include: { options: true } },
} satisfies Prisma.PollInclude;
export function presentGroup(group: Prisma.GroupGetPayload<{ include: typeof groupInclude }>) {
  const { members, imageMediaId, ...rest } = group;
  return {
    ...rest,
    image: imageMediaId ? `/api/v1/uploads/${imageMediaId}` : undefined,
    memberIds: members.map((m) => m.userId),
  };
}
export function presentPoll(poll: Prisma.PollGetPayload<{ include: typeof pollInclude }>) {
  return {
    id: poll.id,
    groupId: poll.groupId,
    authorId: poll.authorId,
    question: poll.question,
    description: poll.description,
    type: poll.type,
    mandatoryAttendance: poll.mandatoryAttendance,
    status: poll.status,
    attendanceLockedAt: poll.attendanceLockedAt,
    createdAt: poll.createdAt,
    singleChoice: poll.singleChoice,
    endsAt: poll.endsAt ?? undefined,
    options: poll.options.map((o) => ({ id: o.id, label: o.label, startsAt: o.startsAt, endsAt: o.endsAt })),
    votes: poll.votes.map((v) => ({
      userId: v.userId,
      optionIds: v.options.map((o) => o.optionId),
    })),
  };
}
export function presentMessage(message: {
  id: string;
  groupId: string;
  authorId: string;
  kind: string;
  text: string;
  createdAt: Date;
  mediaId: string | null;
  pollId: string | null;
  author?: Prisma.UserGetPayload<{ select: typeof memberSelect }>;
}) {
  const { mediaId, pollId, ...rest } = message;
  return {
    ...rest,
    pollId: pollId ?? undefined,
    photoUrl: mediaId ? `/api/v1/uploads/${mediaId}` : undefined,
  };
}
