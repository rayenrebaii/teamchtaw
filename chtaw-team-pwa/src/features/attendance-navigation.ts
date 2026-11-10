import type { Roster } from "@/services/attendance.service";

export const attendanceSessionHref = (id: string, role = "ADMIN") => `${role === "COLLABORATOR" ? "/collaborator" : "/admin"}/attendance/${encodeURIComponent(id)}`;
export const attendanceReturnHref = (id: string, role = "ADMIN") =>
  `${role === "COLLABORATOR" ? "/collaborator" : "/admin"}/attendance?pollId=${encodeURIComponent(id)}`;

// Summarize only server-provided global results. Never infer absence from draft marks.
export function attendanceRosterSummary(roster: Roster) {
  const people = roster.participants
    ? roster.participants
        .filter((person) => person.included)
        .map((person) => ({ id: person.user.id, final: person.final }))
    : [
        ...new Map(
          roster.slots.flatMap((slot) =>
            slot.students.map(
              (student) =>
                [student.user.id, { id: student.user.id, final: student.final }] as const,
            ),
          ),
        ).values(),
      ];
  return {
    concerned: people.length,
    present: people.filter((person) => person.final === "PRESENT").length,
    absent: people.filter((person) => person.final === "ABSENT").length,
    pending: people.filter((person) => person.final === "EN_ATTENTE").length,
  };
}
