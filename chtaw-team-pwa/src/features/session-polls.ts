import type { Poll } from "@/types";
import type { Roster } from "@/services/attendance.service";
export function visibleAttendanceStudents(
  students: Roster["slots"][number]["students"],
  search: string,
  enrollment: string,
  showPresent: boolean,
  mandatory: boolean,
) {
  const terms = search.trim().toLocaleLowerCase("fr").split(/\s+/).filter(Boolean);
  return students.filter(
    (student) =>
      terms.every((term) =>
        `${student.user.firstName} ${student.user.lastName} ${student.user.email}`
          .toLocaleLowerCase("fr")
          .includes(term),
      ) &&
      (!mandatory ||
        showPresent ||
        student.final !== "PRESENT" ||
        student.attendance === "PRESENT") &&
      (enrollment === "ALL" ||
        (enrollment === "VOTED" ? student.voted !== false : student.voted === false)),
  );
}
export type ActivityStatus = "OPEN" | "CLOSED" | "CANCELLED";
export interface ActivityFilters {
  type: "ALL" | "SESSION" | "ORDINARY";
  search: string;
  groupId: string;
  status: "ALL" | ActivityStatus;
}
export const defaultActivityFilters: ActivityFilters = {
  type: "ALL",
  search: "",
  groupId: "",
  status: "ALL",
};
// Session slots close independently at their start; ordinary poll deadlines remain unchanged.
export function activityStatus(poll: Poll, now = Date.now()): ActivityStatus {
  if (poll.status === "CANCELLED") return "CANCELLED";
  return poll.status === "CLOSED" ||
    (poll.type === "SESSION"
      ? poll.options.length > 0 && poll.options.every((o) => !o.startsAt || Date.parse(o.startsAt) <= now)
      : poll.attendanceLockedAt || (poll.endsAt && Date.parse(poll.endsAt) <= now))
    ? "CLOSED"
    : "OPEN";
}
export function filterActivities(polls: Poll[], filters: ActivityFilters, now = Date.now()) {
  const terms = filters.search.trim().toLocaleLowerCase("fr").split(/\s+/).filter(Boolean);
  return polls.filter(
    (poll) =>
      (filters.type === "ALL" || (poll.type ?? "ORDINARY") === filters.type) &&
      (!filters.groupId || poll.groupId === filters.groupId) &&
      (filters.status === "ALL" || activityStatus(poll, now) === filters.status) &&
      terms.every((term) => poll.question.toLocaleLowerCase("fr").includes(term)),
  );
}
export function localDateTime(value: string) {
  const parts = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
  return parts.replace(" ", "T");
}
export function tunisDateTime(value: string) {
  // Africa/Tunis uses UTC+01:00 (no daylight saving).
  return new Date(`${value}:00+01:00`).toISOString();
}

export function sessionInput(poll: Poll, status = poll.status ?? "OPEN") {
  return {
    type: "SESSION" as const,
    question: poll.question,
    description: poll.description ?? "",
    singleChoice: true,
    capacities: poll.options.map((o) => o.capacity!),
    status,
    options: poll.options.map((o) => o.label),
    startsAt: poll.options.map((o) => o.startsAt!),
    mandatoryAttendance: poll.mandatoryAttendance ?? false,
  };
}
export const attendanceLabels: Record<string, string> = {
  NON_INSCRIT: "Non inscrit",
  EN_ATTENTE: "En attente",
  NON_VERIFIE: "Non vérifié",
  PRESENT: "Présent",
  ABSENT: "Absent",
  ANNULE: "Annulée",
  NON_CONCERNE: "Non concerné",
  INCLUDED: "Concerné",
  EXCLUDED: "Retiré de la séance",
  CANCELLED: "Séance annulée",
  ACTIVE: "Séance active",
};
