import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ForbiddenException } from "@nestjs/common";
import { analyticsPeriod } from "../src/analytics/analytics.period";
import { AnalyticsQuery } from "../src/analytics/analytics.dto";
import { AnalyticsService, attendanceRate } from "../src/analytics/analytics.module";
import type { Actor } from "../src/common/access";

const query = (period: AnalyticsQuery["period"], extra = {}) => Object.assign(new AnalyticsQuery(), { period, ...extra });
describe("Dashboard period and authorization boundaries", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it.each([
    ["month", "2026-11-01", "2026-11-30"], ["week", "2026-11-16", "2026-11-22"],
    ["quarter", "2026-08-18", "2026-11-18"], ["year", "2026-01-01", "2026-12-31"],
  ] as const)("resolves %s to inclusive local calendar dates", (period, from, to) => {
    expect(analyticsPeriod(query(period), "Africa/Tunis", now)).toMatchObject({ from, to });
  });
  it("uses the configured timezone at local midnight and clamps month ends", () => {
    expect(analyticsPeriod(query("month"), "Africa/Tunis", new Date("2026-10-31T23:01:00Z")).from).toBe("2026-11-01");
    expect(analyticsPeriod(query("quarter"), "Africa/Tunis", new Date("2026-05-31T12:00:00Z")).from).toBe("2026-02-28");
    expect(analyticsPeriod(query("month"), "America/New_York", new Date("2026-11-01T01:00:00Z")).from).toBe("2026-10-01");
  });
  it.each([{ from: "2026-02-30", to: "2026-03-01" }, { from: "2026-11-02", to: "2026-11-01" }, { from: "2026-01-01T00:00:00Z", to: "2026-11-01" }, {}, { from: "2000-01-01", to: "2026-01-01" }])("rejects invalid or unbounded custom periods", extra => {
    expect(() => analyticsPeriod(query("custom", extra), "Africa/Tunis", now)).toThrow();
  });
  it.each([{ groupId: "not-a-uuid" }, { page: -1 }, { page: "NaN" }, { interval: "arbitrary SQL" }, { period: "bad" }])("validates query inputs", async input => {
    expect((await validate(plainToInstance(AnalyticsQuery, input))).length).toBeGreaterThan(0);
  });
  it("returns no rate without finalized attendances", () => {
    expect(attendanceRate(0, 0)).toBeNull(); expect(attendanceRate(1, 2)).toBe(33.3);
  });
  it("rechecks administrator authorization before every aggregation", async () => {
    const tx = { $queryRaw: jest.fn() };
    const access = { actor: jest.fn().mockRejectedValue(new ForbiddenException()) };
    const service = new AnalyticsService({ $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as never, access as never, { get: () => "Africa/Tunis" } as never);
    for (const method of ["summary", "sessions", "alerts"] as const)
      await expect(service[method]({} as Actor, new AnalyticsQuery())).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
