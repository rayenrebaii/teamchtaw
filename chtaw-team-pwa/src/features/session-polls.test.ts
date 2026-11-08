import { describe, expect, it } from "vitest";
import {
  visibleAttendanceStudents,
  activityStatus,
  defaultActivityFilters,
  filterActivities,
  localDateTime,
  sessionInput,
  attendanceLabels,
} from "./session-polls";
import type { Poll } from "@/types";
import type { Roster } from "@/services/attendance.service";

describe("Listes actives de pointage", () => {
  const user = {
    id: "student",
    firstName: "Amine",
    lastName: "Test",
    email: "amine@test.invalid",
    role: "USER" as const,
    status: "APPROVED" as const,
    bio: "",
    joinedAt: "2026-11-04T10:00:00Z",
  };
  const row: Roster["slots"][number]["students"][number] = {
    user,
    attendance: "NON_VERIFIE",
    version: 0,
    participantVersion: 0,
    absences: 0,
    final: "EN_ATTENTE",
    voted: false,
    hasVoted: false,
  };
  it("garde un étudiant sans vote dans le pointage obligatoire", () => {
    expect(visibleAttendanceStudents([row], "amine", "ALL", false, true)).toEqual([row]);
    expect(visibleAttendanceStudents([row], "", "NOT_VOTED", false, true)).toEqual([row]);
    expect(visibleAttendanceStudents([row], "", "VOTED", false, true)).toEqual([]);
  });
  it("masque une présence enregistrée sur un autre créneau sans supprimer les données", () => {
    const presentElsewhere = { ...row, final: "PRESENT" as const };
    expect(visibleAttendanceStudents([presentElsewhere], "", "ALL", false, true)).toEqual([]);
    expect(visibleAttendanceStudents([presentElsewhere], "", "ALL", true, true)).toEqual([
      presentElsewhere,
    ]);
    expect(presentElsewhere.final).toBe("PRESENT");
  });
  it("garde le pointage présent sur son créneau pour correction et réaffiche après correction", () => {
    const presentHere = { ...row, attendance: "PRESENT" as const, final: "PRESENT" as const };
    expect(visibleAttendanceStudents([presentHere], "", "ALL", false, true)).toEqual([presentHere]);
    expect(visibleAttendanceStudents([row], "", "ALL", false, true)).toEqual([row]);
    expect(visibleAttendanceStudents([row], "autre", "ALL", false, true)).toEqual([]);
  });
});
describe("Formulaire de séance et affichage des présences", () => {
  it("prépare tous les horaires dynamiques sans les limiter à deux", () => {
    for (const count of [1, 2, 3, 5, 10]) {
      const poll: Poll = {
        id: "p",
        groupId: "g",
        authorId: "a",
        question: "Maths",
        type: "SESSION",
        endsAt: "2099-01-01T10:00:00.000Z",
        singleChoice: false,
        votes: [],
        options: Array.from({ length: count }, (_, i) => ({
          id: String(i),
          label: `Horaire ${i}`,
          startsAt: new Date(Date.UTC(2099, 0, i + 2, 10)).toISOString(),
        })),
      };
      const input = sessionInput(poll, "CANCELLED");
      expect(input.options).toHaveLength(count);
      expect(input.startsAt).toHaveLength(count);
      expect(input.status).toBe("CANCELLED");
      expect(input.singleChoice).toBe(false);
      expect(input.startsAt[0]).toBe(poll.options[0]!.startsAt);
    }
  });
  it("affiche les horaires en heure locale sans changer leur date lors de l’édition", () => {
    const instant = new Date(2099, 5, 12, 15, 30);
    expect(new Date(localDateTime(instant.toISOString())).getTime()).toBe(instant.getTime());
    expect(attendanceLabels.NON_INSCRIT).toBe("Non inscrit");
    expect(attendanceLabels.NON_VERIFIE).toBe("Non vérifié");
  });
});

describe("Liste des activités et statut de participation", () => {
  const now = Date.parse("2026-11-04T12:00:00Z");
  const poll = (id: string, patch: Partial<Poll> = {}): Poll => ({
    id,
    groupId: "group-a",
    authorId: "admin",
    question: "Course du samedi",
    type: "SESSION",
    status: "OPEN",
    singleChoice: false,
    options: [],
    votes: [],
    ...patch,
  });
  it("respecte l’annulation, la clôture manuelle, la date limite et le verrouillage des présences", () => {
    expect(activityStatus(poll("open", { endsAt: "2026-11-05T12:00:00Z" }), now)).toBe("OPEN");
    expect(activityStatus(poll("deadline", { endsAt: "2026-11-04T12:00:00Z" }), now)).toBe(
      "CLOSED",
    );
    expect(activityStatus(poll("closed", { status: "CLOSED" }), now)).toBe("CLOSED");
    expect(
      activityStatus(poll("pointed", { attendanceLockedAt: "2026-11-04T10:00:00Z" }), now),
    ).toBe("CLOSED");
    expect(
      activityStatus(
        poll("cancelled", {
          status: "CANCELLED",
          endsAt: "2026-11-01T12:00:00Z",
          attendanceLockedAt: "2026-11-01T10:00:00Z",
        }),
        now,
      ),
    ).toBe("CANCELLED");
    expect(activityStatus(poll("ordinary", { type: undefined, status: undefined }), now)).toBe(
      "OPEN",
    );
  });
  it("combine les filtres de type, de titre, de groupe et de statut sans modifier les activités", () => {
    const polls = [
      poll("session"),
      poll("ordinary", { type: "ORDINARY", question: "Choix du matériel" }),
      poll("other", { groupId: "group-b" }),
      poll("expired", { endsAt: "2026-11-04T11:00:00Z" }),
    ];
    expect(
      filterActivities(
        polls,
        {
          ...defaultActivityFilters,
          type: "SESSION",
          search: " SAMEDI course ",
          groupId: "group-a",
          status: "OPEN",
        },
        now,
      ).map((p) => p.id),
    ).toEqual(["session"]);
    expect(
      filterActivities(polls, { ...defaultActivityFilters, status: "CLOSED" }, now).map(
        (p) => p.id,
      ),
    ).toEqual(["expired"]);
    expect(
      filterActivities(polls, { ...defaultActivityFilters, search: "introuvable" }, now),
    ).toEqual([]);
    expect(filterActivities(polls, defaultActivityFilters, now)).toEqual(polls);
    expect(polls.map((p) => p.id)).toEqual(["session", "ordinary", "other", "expired"]);
  });
  it("classe les anciens sondages sans type explicite parmi les sondages ordinaires", () => {
    const legacy = poll("legacy", { type: undefined });
    expect(
      filterActivities([legacy], { ...defaultActivityFilters, type: "ORDINARY" }, now),
    ).toEqual([legacy]);
    expect(filterActivities([legacy], { ...defaultActivityFilters, type: "SESSION" }, now)).toEqual(
      [],
    );
  });
});
