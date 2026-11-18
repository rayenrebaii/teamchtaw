import { BadRequestException } from "@nestjs/common";
import type { AnalyticsQuery } from "./analytics.dto";

export function calendarDate(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function analyticsPeriod(query: AnalyticsQuery, timeZone: string, now = new Date()) {
  const today = calendarDate(now, timeZone);
  const date = new Date(`${today}T00:00:00Z`);
  const day = (value: Date) => value.toISOString().slice(0, 10);
  let from = today, to = today;
  if (query.period === "custom") {
    if (!query.from || !query.to || !/^\d{4}-\d{2}-\d{2}$/.test(query.from) || !/^\d{4}-\d{2}-\d{2}$/.test(query.to))
      throw new BadRequestException("Choisissez une date de début et de fin valides.");
    from = query.from; to = query.to;
  } else if (query.period === "week") {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    from = day(date); date.setUTCDate(date.getUTCDate() + 6); to = day(date);
  } else if (query.period === "month") {
    from = `${today.slice(0, 7)}-01`;
    to = day(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
  } else if (query.period === "quarter") {
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 3, 1));
    const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(date.getUTCDate(), lastDay)); from = day(first);
  } else if (query.period === "year") {
    from = `${today.slice(0, 4)}-01-01`; to = `${today.slice(0, 4)}-12-31`;
  }
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || day(start) !== from || day(end) !== to || from > to)
    throw new BadRequestException("La période est invalide.");
  if ((+end - +start) / 86400000 > 1830) throw new BadRequestException("La période ne peut pas dépasser cinq ans.");
  return { from, to, timeZone, now, groupId: query.groupId ?? null, interval: query.interval };
}
export type AnalyticsPeriod = ReturnType<typeof analyticsPeriod>;
