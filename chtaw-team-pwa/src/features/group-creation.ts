import type { Group, User } from "@/types";

// Keep successful additions on a partial failure so retrying only adds missing members.
export async function addSelectedGroupMembers(
  group: Group,
  users: User[],
  selectedIds: string[],
  addMember: (groupId: string, userId: string) => Promise<Group>,
  receiveGroup: (group: Group) => void,
) {
  let current = group;
  const selected = new Set(selectedIds);
  for (const user of users) {
    if (
      user.status !== "APPROVED" ||
      user.role !== "USER" ||
      !selected.has(user.id) ||
      current.memberIds.includes(user.id)
    )
      continue;
    current = await addMember(current.id, user.id);
    receiveGroup(current);
  }
  return current;
}
