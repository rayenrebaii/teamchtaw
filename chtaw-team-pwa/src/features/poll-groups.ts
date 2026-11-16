import type { Group, Poll } from "@/types";

export function pollGroupIds(poll: Pick<Poll, "groupId" | "groupIds" | "type">) {
  return [...new Set([poll.groupId, ...(poll.type === "SESSION" ? poll.groupIds ?? [] : [])])];
}
export function pollInGroup(poll: Pick<Poll, "groupId" | "groupIds" | "type">, groupId: string) {
  return pollGroupIds(poll).includes(groupId);
}
export function pollGroupNames(poll: Poll, groups: Group[]) {
  return pollGroupIds(poll).map(id => poll.groups?.find(group => group.id === id)?.name ?? groups.find(group => group.id === id)?.name).filter(Boolean).join(" · ");
}
