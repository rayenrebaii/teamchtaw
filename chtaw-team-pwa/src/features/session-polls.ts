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
// A deadline or the first attendance save closes participation even if status is still OPEN.
export function activityStatus(poll: Poll, now = Date.now()): ActivityStatus {
  if (poll.status === "CANCELLED") return "CANCELLED";
  return poll.status === "CLOSED" ||
    poll.attendanceLockedAt ||
    (poll.endsAt && Date.parse(poll.endsAt) <= now)
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
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
export function sessionInput(poll: Poll, status = poll.status ?? "OPEN") {
  return {
    type: "SESSION" as const,
    question: poll.question,
    description: poll.description ?? "",
    singleChoice: false as const,
    status,
    endsAt: poll.endsAt!,
    options: poll.options.map((o) => o.label),
    startsAt: poll.options.map((o) => o.startsAt!),
    mandatoryAttendance: poll.mandatoryAttendance ?? false,
    ...(poll.mandatoryAttendance ? { slotEndsAt: poll.options.map((o) => o.endsAt!) } : {}),
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
