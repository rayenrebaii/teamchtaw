import type { Group, Status, User } from "@/types";

export interface RequestFilters {
  search: string;
  status: Status | "ALL";
  groupId: string;
  start: string;
  end: string;
  order: "recent" | "oldest";
}
export const defaultRequestFilters: RequestFilters = {
  search: "",
  status: "PENDING",
  groupId: "",
  start: "",
  end: "",
  order: "recent",
};
// Match the calendar day displayed to the administrator, including its local timezone.
export function requestDay(value: string) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function isValidRequestPeriod(start: string, end: string) {
  return !start || !end || start <= end;
}
export function filterRequests(users: User[], filters: RequestFilters, groups: Group[] = []) {
  if (!isValidRequestPeriod(filters.start, filters.end)) return [];
  const memberIds = filters.groupId
    ? new Set(groups.find((group) => group.id === filters.groupId)?.memberIds ?? [])
    : null;
  const terms = filters.search.trim().toLocaleLowerCase("fr").split(/\s+/).filter(Boolean);
  return [...new Map(users.map((user) => [user.id, user])).values()]
    .filter((user) => {
      const text = `${user.firstName} ${user.lastName} ${user.email}`.toLocaleLowerCase("fr");
      const day = requestDay(user.joinedAt);
      return (
        terms.every((term) => text.includes(term)) &&
        (filters.status === "ALL" || user.status === filters.status) &&
        (!memberIds || memberIds.has(user.id)) &&
        (!filters.start || day >= filters.start) &&
        (!filters.end || day <= filters.end)
      );
    })
    .sort((a, b) => {
      const delta =
        new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime() || a.id.localeCompare(b.id);
      return filters.order === "oldest" ? delta : -delta;
    });
}
