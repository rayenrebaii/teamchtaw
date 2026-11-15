import { Prisma } from "@prisma/client";
export const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  bio: true,
  role: true,
} satisfies Prisma.UserSelect;
export const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  bio: true,
  role: true,
  status: true,
  emailVerified: true,
  joinedAt: true,
  disabledAt: true,
  activatedAt: true,
} satisfies Prisma.UserSelect;
export const groupInclude = { members: { select: { userId: true } } } satisfies Prisma.GroupInclude;
export const pollInclude = {
  options: { orderBy: { position: "asc" } },
  votes: { include: { options: true } },
  participants: { select: { userId: true, absenceConfirmedAt: true, marks: { select: { version: true, attendance: true } } } },
} satisfies Prisma.PollInclude;
// A group conversation carries its public poll card independently of organizer management lists.
export const messageInclude = {
  author: { select: memberSelect },
  poll: { include: pollInclude },
} satisfies Prisma.MessageInclude;
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
    participationLockedUserIds: (poll.participants ?? []).filter((p) => p.absenceConfirmedAt || p.marks.some((m) => m.version > 0 || m.attendance !== "NON_VERIFIE")).map((p) => p.userId),
    status: poll.status,
    attendanceLockedAt: poll.attendanceLockedAt,
    createdAt: poll.createdAt,
    singleChoice: poll.singleChoice,
    endsAt: poll.endsAt ?? undefined,
    options: poll.options.map((o) => ({ id: o.id, label: o.label, startsAt: o.startsAt, endsAt: o.endsAt, capacity: o.capacity })),
    votes: poll.votes.map((v) => ({
      userId: v.userId,
      attendanceLocked: v.options.some((o) => o.version > 0 || o.attendance !== "NON_VERIFIE"),
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
  poll?: Prisma.PollGetPayload<{ include: typeof pollInclude }> | null;
}) {
  const { mediaId, pollId, poll, ...rest } = message;
  return {
    ...rest,
    pollId: pollId ?? undefined,
    poll: poll && !poll.archivedAt ? presentPoll(poll) : undefined,
    photoUrl: mediaId ? `/api/v1/uploads/${mediaId}` : undefined,
  };
}
