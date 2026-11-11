import { sessionDeletionMode, assertSessionCancellationAllowed } from "../src/polls/session-deletion.rules";

const now = new Date("2026-11-15T12:00:00Z");
const hour = 3600000;
const slot = (start: number, end: number) => ({ startsAt: new Date(+now + start * hour), endsAt: new Date(+now + end * hour) });
const person = (attendance: string, confirmed = false) => ({ included: true, absenceConfirmedAt: confirmed ? now : null, marks: [{ attendance }] });
const base = () => ({ type: "SESSION", mandatoryAttendance: true, attendanceLockedAt: null as Date | null,
  options: [slot(3, 4), slot(5, 6)], participants: [person("NON_VERIFIE")], votes: [] });

describe("Session deletion lifecycle", () => {
  it("allows cancellation at exactly two hours before the earliest slot", () => {
    const poll = base(); poll.options = [slot(4, 5), slot(2, 3)];
    expect(sessionDeletionMode(poll, now)).toBe("DELETE");
    expect(() => assertSessionCancellationAllowed(poll.options, new Date(+now + 1))).toThrow();
  });
  it.each([1.99, 0, -0.5])("blocks deletion at %s hours before the first slot", (start) => {
    const poll = base(); poll.options[0] = slot(start, 1);
    expect(() => sessionDeletionMode(poll, now)).toThrow();
  });
  it("waits for both slots to end even when every attendance result is already saved", () => {
    const poll = base(); poll.options = [slot(-4, -3), slot(-1, 1)];
    poll.attendanceLockedAt = now; poll.participants = [person("PRESENT"), person("ABSENT", true)];
    expect(() => sessionDeletionMode(poll, now)).toThrow("tous les créneaux");
    poll.options[1] = slot(-2, 0);
    expect(sessionDeletionMode(poll, now)).toBe("ARCHIVE");
  });
  it("requires every concerned student's attendance, not just the first saved mark", () => {
    const poll = base(); poll.options = [slot(-4, -3), slot(-2, -1)]; poll.attendanceLockedAt = now;
    poll.participants = [person("PRESENT"), person("NON_VERIFIE")];
    expect(() => sessionDeletionMode(poll, now)).toThrow("tous les étudiants");
    poll.participants[1] = person("ABSENT");
    expect(() => sessionDeletionMode(poll, now)).toThrow();
    poll.participants[1] = person("ABSENT", true);
    expect(sessionDeletionMode(poll, now)).toBe("ARCHIVE");
  });
  it("does not infer completion from an unknown slot end", () => {
    const poll = base(); poll.attendanceLockedAt = now; poll.participants = [person("PRESENT")];
    poll.options = [{ startsAt: new Date(+now - hour), endsAt: null! }];
    expect(() => sessionDeletionMode(poll, now)).toThrow();
  });
  it("preserves the same gate for legacy attendance and leaves ordinary polls unaffected", () => {
    const poll = { ...base(), mandatoryAttendance: false, attendanceLockedAt: now,
      options: [slot(-2, -1)], votes: [{ options: [{ attendance: "NON_VERIFIE" }] }] };
    expect(() => sessionDeletionMode(poll, now)).toThrow();
    poll.votes[0]!.options[0]!.attendance = "PRESENT";
    expect(sessionDeletionMode(poll, now)).toBe("ARCHIVE");
    poll.type = "ORDINARY";
    expect(sessionDeletionMode(poll, now)).toBe("DELETE");
  });
});
