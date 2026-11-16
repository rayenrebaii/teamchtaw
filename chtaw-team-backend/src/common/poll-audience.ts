import { Prisma } from "@prisma/client";
export type PollAudience = { groupId: string; type?: string; groups?: { groupId: string }[] };
export function pollGroupIds(poll: PollAudience) {
  return [...new Set([poll.groupId, ...(poll.type === "ORDINARY" ? [] : poll.groups?.map(row => row.groupId) ?? [])])].sort();
}
export function pollMember(userId: string): Prisma.PollWhereInput {
  return { OR: [{ group: { members: { some: { userId } } } }, { type: "SESSION", groups: { some: { group: { members: { some: { userId } } } } } }] };
}
export function pollInGroup(groupId?: string): Prisma.PollWhereInput {
  return groupId ? { OR: [{ groupId }, { type: "SESSION", groups: { some: { groupId } } }] } : {};
}
