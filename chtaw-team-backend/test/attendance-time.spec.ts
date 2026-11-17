import { ConflictException } from "@nestjs/common";
import { assertAttendanceStarted } from "../src/polls/attendance-time";
describe("Pointage à partir du début réel du créneau", () => {
  const startsAt = new Date("2026-11-09T09:00:00Z");
  it("refuse le 6 novembre une séance prévue le 9 et la milliseconde précédant son début", () => {
    expect(() => assertAttendanceStarted({ startsAt }, new Date("2026-11-06T10:00:00Z"))).toThrow(ConflictException);
    expect(() => assertAttendanceStarted({ startsAt }, new Date(startsAt.getTime() - 1))).toThrow(ConflictException);
  });
  it("autorise exactement à l’heure prévue et après la séance", () => {
    expect(() => assertAttendanceStarted({ startsAt }, startsAt)).not.toThrow();
    expect(() => assertAttendanceStarted({ startsAt }, new Date("2026-11-10T10:00:00Z"))).not.toThrow();
  });
  it("ne permet pas de contourner la règle avec une date absente", () => {
    expect(() => assertAttendanceStarted({ startsAt: null })).toThrow();
    expect(() => assertAttendanceStarted(undefined)).toThrow();
  });
});
