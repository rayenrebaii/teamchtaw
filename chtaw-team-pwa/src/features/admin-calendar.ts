import type { Poll } from "@/types";

export const CALENDAR_TIME_ZONE = "Africa/Tunis";
const dateParts = new Intl.DateTimeFormat("en", { timeZone: CALENDAR_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });
export function calendarDay(instant: number | string | Date) {
  const parts = dateParts.formatToParts(new Date(instant));
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function isCalendarDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
// Calendar arithmetic uses date-only UTC values; event times always use Africa/Tunis.
export function addCalendarDays(day: string, count: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function calendarWeek(day: string) {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addCalendarDays(day, -((weekday + 6) % 7));
}
export interface CalendarSlot {
  id: string;
  pollId: string;
  groupId: string;
  question: string;
  label: string;
  startsAt: string;
  endsAt?: string;
  start: number;
  end?: number;
  firstDay: string;
  lastDay: string;
  cancelled: boolean;
}
export function calendarSlots(polls: Poll[]): CalendarSlot[] {
  return polls.filter((poll) => poll.type === "SESSION").flatMap((poll) => poll.options.flatMap((option) => {
    const start = Date.parse(option.startsAt ?? "");
    if (!Number.isFinite(start)) return [];
    const candidateEnd = Date.parse(option.endsAt ?? "");
    const end = Number.isFinite(candidateEnd) && candidateEnd > start ? candidateEnd : undefined;
    return [{
      id: `${poll.id}:${option.id}`, pollId: poll.id, groupId: poll.groupId, question: poll.question, label: option.label,
      startsAt: option.startsAt!, endsAt: end !== undefined ? option.endsAt! : undefined, start, end,
      firstDay: calendarDay(start), lastDay: calendarDay(end !== undefined ? end - 1 : start), cancelled: poll.status === "CANCELLED",
    }];
  })).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
export function calendarSlotStatus(slot: CalendarSlot, now: number) {
  if (slot.cancelled) return "CANCELLED";
  if (slot.end !== undefined && slot.end <= now) return "COMPLETED";
  if (slot.start > now) return "UPCOMING";
  return slot.end !== undefined ? "ONGOING" : "PAST_WITHOUT_END";
}
export function slotsInWeek(slots: CalendarSlot[], week: string) {
  const last = addCalendarDays(week, 6);
  return slots.filter((slot) => slot.firstDay <= last && slot.lastDay >= week);
}
export function calendarWeeks(slots: CalendarSlot[], current: string, selected: string) {
  const weeks = new Set([current, selected]);
  for (const slot of slots) {
    const last = calendarWeek(slot.lastDay);
    for (let week = calendarWeek(slot.firstDay); week <= last; week = addCalendarDays(week, 7)) weeks.add(week);
  }
  return [...weeks].sort();
}
