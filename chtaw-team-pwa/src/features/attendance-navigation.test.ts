import { describe, expect, it } from "vitest";
import {
  attendanceReturnHref,
  attendanceRosterSummary,
  attendanceSessionHref,
} from "./attendance-navigation";
import type { Roster } from "@/services/attendance.service";
import type { User } from "@/types";
const user = (id: string): User => ({
  id,
  firstName: "Test",
  lastName: id,
  email: `${id}@test.invalid`,
  role: "USER",
  status: "APPROVED",
  bio: "",
  joinedAt: "2026-11-04T10:00:00Z",
});
const base: Roster = {
  id: "session",
  question: "Séance",
  status: "OPEN",
  group: { id: "g", name: "Groupe" },
  attendanceLockedAt: null,
  slots: [],
};

describe("Navigation et bilan du pointage", () => {
  it("conserve la séance dans la route et dans le lien de retour", () => {
    expect(attendanceSessionHref("session-123")).toBe("/admin/attendance/session-123");
    expect(attendanceReturnHref("session-123")).toBe("/admin/attendance?pollId=session-123");
    expect(attendanceSessionHref("a/b")).toBe("/admin/attendance/a%2Fb");
  });
  it("compte uniquement les résultats globaux enregistrés des participants inclus", () => {
    const roster: Roster = {
      ...base,
      slots: [],
      participants: [
        { user: user("a"), included: true, final: "PRESENT", version: 0 },
        { user: user("b"), included: true, final: "ABSENT", version: 0 },
        { user: user("c"), included: true, final: "EN_ATTENTE", version: 0 },
        { user: user("d"), included: false, final: "ABSENT", version: 0 },
      ],
    };
    expect(attendanceRosterSummary(roster)).toEqual({
      concerned: 3,
      present: 1,
      absent: 1,
      pending: 1,
    });
  });
  it("ne double pas les étudiants des anciennes séances qui figurent sur plusieurs créneaux", () => {
    const people: Roster["slots"][number]["students"] = [
      { user: user("a"), final: "PRESENT", attendance: "PRESENT", version: 0, absences: 0 },
      { user: user("b"), final: "ABSENT", attendance: "ABSENT", version: 0, absences: 1 },
    ];
    const roster: Roster = {
      ...base,
      slots: ["first", "second"].map((id) => ({
        id,
        label: id,
        startsAt: "2026-11-04T10:00:00Z",
        students: people,
      })),
    };
    expect(attendanceRosterSummary(roster)).toEqual({
      concerned: 2,
      present: 1,
      absent: 1,
      pending: 0,
    });
  });
});
