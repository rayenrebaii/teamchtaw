import { expect, it } from "vitest";
import { addCalendarDays, calendarDay, calendarWeek, calendarWeeks, calendarSlots, calendarSlotStatus, isCalendarDay, slotsInWeek } from "./admin-calendar";
import type { Poll } from "@/types";
const session = (startsAt: string, endsAt?: string): Poll => ({ id: "session", groupId: "group", authorId: "admin", question: "Séance", type: "SESSION", status: "OPEN", singleChoice: false, votes: [], options: [{ id: "slot", label: "Horaire", startsAt, endsAt }] });
it("uses Tunis time and a Monday to Sunday week across UTC, year and leap-day boundaries", () => {
  expect(calendarDay("2026-11-08T23:00:00Z")).toBe("2026-11-09");
  expect(calendarWeek(calendarDay("2026-11-08T22:59:59Z"))).toBe("2026-11-02");
  expect(calendarWeek(calendarDay("2026-11-08T23:00:00Z"))).toBe("2026-11-09");
  expect(calendarWeek("2027-01-01")).toBe("2026-12-28");
  expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
  expect(isCalendarDay("2026-02-30")).toBe(false);
  expect(isCalendarDay("invalid")).toBe(false);
});
it("imports all persisted session slots without votes and excludes ordinary polls and invalid dates", () => {
  const poll = session("2026-11-03T10:00:00Z", "2026-11-03T11:00:00Z");
  const result = calendarSlots([{ ...poll, options: [...poll.options, { id: "next", label: "Next week", startsAt: "2026-11-10T10:00:00Z" }, { id: "invalid", label: "Invalid", startsAt: "bad" }] }, { ...poll, id: "ordinary", type: "ORDINARY" }]);
  expect(result.map((slot) => slot.id)).toEqual(["session:slot", "session:next"]);
  expect(slotsInWeek(result, "2026-11-02")).toHaveLength(1);
  expect(slotsInWeek(result, "2026-11-09")).toHaveLength(1);
});
it("marks completion by actual slot end, independently of voting closure or attendance locking", () => {
  const poll = { ...session("2026-11-03T10:00:00Z", "2026-11-03T11:00:00Z"), status: "CLOSED" as const, attendanceLockedAt: "2026-11-01T10:00:00Z" };
  const slot = calendarSlots([poll])[0]!;
  expect(calendarSlotStatus(slot, Date.parse("2026-11-03T09:59:59Z"))).toBe("UPCOMING");
  expect(calendarSlotStatus(slot, Date.parse("2026-11-03T10:00:00Z"))).toBe("ONGOING");
  expect(calendarSlotStatus(slot, Date.parse("2026-11-03T11:00:00Z"))).toBe("COMPLETED");
  expect(calendarSlotStatus({ ...slot, cancelled: true }, Date.parse("2026-11-04T11:00:00Z"))).toBe("CANCELLED");
});
it("keeps legacy slots with an unknown end honest about completion", () => {
  const slot = calendarSlots([session("2026-11-03T10:00:00Z")])[0]!;
  expect(calendarSlotStatus(slot, Date.parse("2026-11-03T11:00:00Z"))).toBe("PAST_WITHOUT_END");
});
it("includes a cross-week overnight slot in both weeks, but excludes a midnight end from the next week", () => {
  const overnight = calendarSlots([session("2026-11-08T22:30:00Z", "2026-11-08T23:30:00Z")]);
  expect(slotsInWeek(overnight, "2026-11-02")).toHaveLength(1);
  expect(slotsInWeek(overnight, "2026-11-09")).toHaveLength(1);
  const midnight = calendarSlots([session("2026-11-08T22:30:00Z", "2026-11-08T23:00:00Z")]);
  expect(slotsInWeek(midnight, "2026-11-09")).toHaveLength(0);
});
it("retains past and future weeks alongside an empty current week without mutating saved sessions", () => {
  const poll = session("2026-10-27T10:00:00Z", "2026-11-10T11:00:00Z");
  const original = structuredClone(poll);
  expect(calendarWeeks(calendarSlots([poll]), "2026-11-16", "2026-11-23")).toEqual(["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"]);
  expect(poll).toEqual(original);
});
