import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Administrator analytics on disposable PostgreSQL", () => {
  let app: INestApplication, db: PrismaService, groupA: string, groupB: string, sharedId: string;
  const ids: Record<string, string> = {}, tokens: Record<string, string> = {};
  let limiter = new ThrottlerStorageService();
  const api = () => request(app.getHttpServer());
  const auth = (role = "admin") => ({ Authorization: `Bearer ${tokens[role]}` });
  const range = "period=custom&from=2020-10-01&to=2020-10-31";
  const endpoint = "/api/v1/admin/analytics";
  async function session(name: string, start: string, extra: { mandatory?: boolean; shared?: boolean; cancelled?: boolean; incomplete?: boolean; archived?: boolean; slots?: number } = {}) {
    return db.poll.create({ data: { groupId: groupA, authorId: ids.admin!, type: "SESSION", question: name,
      status: extra.cancelled ? "CANCELLED" : "CLOSED", mandatoryAttendance: extra.mandatory ?? false,
      ...(extra.archived ? { archivedAt: new Date("2020-10-20T12:00:00Z") } : {}),
      ...(extra.shared ? { groups: { create: { groupId: groupB } } } : {}),
      options: { create: Array.from({ length: extra.slots ?? 1 }, (_, position) => ({ label: `Slot ${position}`, position,
        startsAt: new Date(Date.parse(start) + position * 7200000), endsAt: extra.incomplete ? null : new Date(Date.parse(start) + position * 7200000 + 5400000) })) },
    }, include: { options: { orderBy: { position: "asc" } } } });
  }
  async function vote(poll: Awaited<ReturnType<typeof session>>, user: string, marks: ("PRESENT" | "ABSENT" | "NON_VERIFIE")[]) {
    const created = await db.pollVote.create({ data: { pollId: poll.id, userId: ids[user]! } });
    await db.pollVoteOption.createMany({ data: marks.map((attendance, i) => ({ voteId: created.id, pollId: poll.id, optionId: poll.options[i]!.id, attendance })) });
  }
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false })); await app.init(); db = app.get(PrismaService);
    const password = "Disposable-Analytics-2026!", passwordHash = await argon2.hash(password);
    for (const [name, joinedAt] of [["admin", "2020-09-01T10:00:00Z"], ["a", "2020-09-20T10:00:00Z"], ["b", "2020-09-30T23:00:00Z"], ["c", "2020-10-15T10:00:00Z"], ["pending", "2020-10-15T12:00:00Z"], ["collaborator", "2020-10-20T10:00:00Z"]]) {
      const user = await db.user.create({ data: { email: `analytics-${name}-${randomUUID()}@test.invalid`, firstName: name!, lastName: "Analytics", passwordHash,
        role: name === "admin" ? "ADMIN" : name === "collaborator" ? "COLLABORATOR" : "USER", status: name === "pending" ? "PENDING" : "APPROVED", joinedAt: new Date(joinedAt!),
        ...(name === "collaborator" ? { activatedAt: new Date() } : {}) } });
      ids[name!] = user.id;
      // Each disposable identity gets a fresh test request budget; production limits stay enabled.
      limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService();
      tokens[name!] = (await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200)).body.accessToken;
    }
    groupA = (await db.group.create({ data: { name: "Analytics A", members: { create: ["admin", "a", "b", "c"].map(name => ({ userId: ids[name]! })) } } })).id;
    groupB = (await db.group.create({ data: { name: "Analytics B", members: { create: ["admin", "a"].map(name => ({ userId: ids[name]! })) } } })).id;
    const legacy = await session("Multi-slot legacy", "2020-10-10T09:00:00Z", { slots: 2 });
    await vote(legacy, "a", ["PRESENT", "PRESENT"]); await vote(legacy, "b", ["ABSENT", "ABSENT"]); await vote(legacy, "c", ["ABSENT", "NON_VERIFIE"]); await vote(legacy, "admin", ["PRESENT", "PRESENT"]);
    const shared = await session("Shared mandatory", "2020-10-12T09:00:00Z", { mandatory: true, shared: true, slots: 2 }); sharedId = shared.id;
    for (const name of ["a", "b", "c", "pending"]) await db.sessionParticipant.create({ data: { pollId: shared.id, userId: ids[name]!, included: name !== "pending",
      absenceConfirmedAt: name === "b" ? new Date("2020-10-12T14:00:00Z") : null,
      marks: { create: shared.options.map((option, i) => ({ optionId: option.id, attendance: name === "a" ? "PRESENT" : name === "b" || i === 0 ? "ABSENT" : "NON_VERIFIE" })) } } });
    const archived = await session("Retained archive", "2020-10-13T09:00:00Z", { archived: true }); await vote(archived, "a", ["PRESENT"]);
    const lower = await session("Inclusive Tunis midnight", "2020-09-30T23:00:00Z"); await vote(lower, "b", ["ABSENT"]);
    const upper = await session("Inclusive last local day", "2020-10-31T22:59:00Z"); await vote(upper, "a", ["PRESENT"]);
    for (const [name, start, extra] of [
      ["Before local start", "2020-09-30T22:59:00Z", {}], ["After local end", "2020-10-31T23:00:00Z", {}],
      ["Cancelled", "2020-10-09T09:00:00Z", { cancelled: true }], ["Missing end", "2020-10-09T09:00:00Z", { incomplete: true }],
      ["Future", "2099-10-09T09:00:00Z", {}],
    ] as const) { const poll = await session(name, start, extra); await vote(poll, "a", ["PRESENT"]); }
    await db.organizerAbsenceState.create({ data: { userId: ids.b!, organizerId: ids.admin!, total: 3, generation: 1 } });
    await db.organizerAbsenceAlert.create({ data: { userId: ids.b!, organizerId: ids.admin!, generation: 1, groupName: "Historical group", pollIds: [shared.id, legacy.id, lower.id], createdAt: new Date("2020-10-20") } });
  }, 60000);
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it("protects all analytical endpoints and validates inputs", async () => {
    for (const path of ["", "/sessions", "/alerts"]) {
      await api().get(endpoint + path).expect(401);
      for (const role of ["a", "collaborator", "pending"]) await api().get(endpoint + path).set(auth(role)).expect(403);
    }
    for (const input of ["groupId=invalid", "page=-1", "interval=invalid", "period=custom&from=2020-02-30&to=2020-03-01"])
      await api().get(`${endpoint}?${input}`).set(auth()).expect(400);
    await api().get(`${endpoint}?groupId=${randomUUID()}`).set(auth()).expect(404);
  });
  it("counts one student/session, excludes incomplete and future attendance, and retains archives", async () => {
    const { body } = await api().get(`${endpoint}?${range}&groupId=${groupA}`).set(auth()).expect(200);
    expect(body.period).toMatchObject({ from: "2020-10-01", to: "2020-10-31", timeZone: "Africa/Tunis" });
    expect(body.kpis).toMatchObject({ users: 4, approved: 4, pendingUsers: 0, groups: 1, sessions: 5, present: 4, absent: 3, pending: 2, rate: 57.1 });
    const shared = (await api().get(`${endpoint}/sessions?${range}&groupId=${groupA}`).set(auth()).expect(200)).body.items.find((row: { id: string }) => row.id === sharedId);
    expect(shared).toMatchObject({ present: 1, absent: 1, pending: 1, rate: 50 });
    expect(shared.groups).toEqual(["Analytics A", "Analytics B"]);
  });
  it("deduplicates shared sessions globally and explains per-group duplication in the data", async () => {
    const { body } = await api().get(`${endpoint}?${range}`).set(auth()).expect(200);
    expect(body.kpis).toMatchObject({ sessions: 5, present: 4, absent: 3, pending: 2 });
    const a = body.groups.find((g: { id: string }) => g.id === groupA), b = body.groups.find((g: { id: string }) => g.id === groupB);
    expect(a).toMatchObject({ present: 4, absent: 3, members: 3 });
    expect(b).toMatchObject({ present: 1, absent: 1, members: 1 });
    expect(a.present + b.present).toBeGreaterThan(body.kpis.present);
    // Admin has not been added to group B through a permission workaround.
    await db.groupMember.delete({ where: { groupId_userId: { groupId: groupB, userId: ids.admin! } } });
    await api().get(`${endpoint}?${range}&groupId=${groupB}`).set(auth()).expect(200);
  });
  it("zero-fills registrations and carries the retained baseline across daily, weekly and monthly buckets", async () => {
    const { body } = await api().get(`${endpoint}?${range}`).set(auth()).expect(200);
    expect(body.registrations).toHaveLength(31);
    expect(body.registrations[0]).toMatchObject({ from: "2020-10-01", count: 1, cumulative: 3 });
    expect(body.registrations[1]).toMatchObject({ count: 0, cumulative: 3 });
    expect(body.registrations.at(-1).cumulative).toBe(6);
    expect(body.kpis).toMatchObject({ users: 6, approved: 5, pendingUsers: 1 });
    for (const interval of ["week", "month"]) {
      const result = (await api().get(`${endpoint}?${range}&interval=${interval}`).set(auth()).expect(200)).body;
      expect(result.registrations.reduce((n: number, row: { count: number }) => n + row.count, 0)).toBe(4);
      expect(result.registrations.at(-1).cumulative).toBe(6);
    }
  });
  it("returns null rates and empty pages without turning missing marks or future votes into absences", async () => {
    for (const year of ["2019", "2099"]) {
      const q = `period=custom&from=${year}-10-01&to=${year}-10-31&groupId=${groupA}`;
      const result = (await api().get(`${endpoint}?${q}`).set(auth()).expect(200)).body;
      expect(result.kpis).toMatchObject({ sessions: 0, present: 0, absent: 0, pending: 0, rate: null });
      expect((await api().get(`${endpoint}/sessions?${q}`).set(auth()).expect(200)).body).toMatchObject({ total: 0, items: [] });
    }
  });
  it("uses existing active threshold alerts independently of graph dates and follows current session links", async () => {
    const result = (await api().get(`${endpoint}/alerts?groupId=${groupB}&period=custom&from=2019-01-01&to=2019-01-02`).set(auth()).expect(200)).body;
    expect(result.total).toBe(1); expect(result.items[0]).toMatchObject({ userId: ids.b, absences: 3, groups: ["Analytics A", "Analytics B"] });
    await db.organizerAbsenceAlert.updateMany({ where: { userId: ids.b }, data: { resolvedAt: new Date() } });
    expect((await api().get(`${endpoint}/alerts?groupId=${groupB}`).set(auth()).expect(200)).body.total).toBe(0);
  });
  it("paginates sessions server-side with stable order", async () => {
    const ids = [];
    for (let i = 0; i < 5; i++) ids.push((await session(`Pagination ${i}`, "2020-10-02T12:00:00Z")).id);
    const first = (await api().get(`${endpoint}/sessions?${range}&groupId=${groupA}`).set(auth()).expect(200)).body;
    const second = (await api().get(`${endpoint}/sessions?${range}&groupId=${groupA}&page=2`).set(auth()).expect(200)).body;
    expect(first.total).toBe(10); expect(first.limit).toBe(6); expect(first.items).toHaveLength(6); expect(second.items).toHaveLength(4);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(10);
    await db.poll.deleteMany({ where: { id: { in: ids } } });
  });
  it("paginates active alerts without deriving their threshold from chart dates", async () => {
    const userIds: string[] = [], passwordHash = await argon2.hash("Disposable-Alert-Only-2026!");
    for (let i = 0; i < 7; i++) {
      const user = await db.user.create({ data: { email: `alert-page-${randomUUID()}@test.invalid`, firstName: `Alert${i}`, lastName: "Fixture", passwordHash, role: "USER", status: "APPROVED" } }); userIds.push(user.id);
      await db.organizerAbsenceState.create({ data: { userId: user.id, organizerId: ids.admin!, total: 3 } });
      await db.organizerAbsenceAlert.create({ data: { userId: user.id, organizerId: ids.admin!, generation: 1, groupName: "Analytics B", pollIds: [sharedId] } });
    }
    const first = (await api().get(`${endpoint}/alerts?groupId=${groupB}`).set(auth()).expect(200)).body;
    const second = (await api().get(`${endpoint}/alerts?groupId=${groupB}&page=2`).set(auth()).expect(200)).body;
    expect(first.total).toBe(7); expect(first.limit).toBe(6); expect(first.items).toHaveLength(6); expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(7);
    await db.organizerAbsenceAlert.deleteMany({ where: { userId: { in: userIds } } });
    await db.organizerAbsenceState.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  });
  it("reflects permanent account deletion in the retained cumulative baseline", async () => {
    const passwordHash = await argon2.hash("Disposable-Retained-Only-2026!");
    const user = await db.user.create({ data: { email: `retained-${randomUUID()}@test.invalid`, firstName: "Retained", lastName: "Fixture", passwordHash, role: "USER", status: "APPROVED", joinedAt: new Date("2020-09-01") } });
    const before = (await api().get(`${endpoint}?${range}`).set(auth()).expect(200)).body;
    await db.user.delete({ where: { id: user.id } });
    const after = (await api().get(`${endpoint}?${range}`).set(auth()).expect(200)).body;
    expect(after.registrations[0].cumulative).toBe(before.registrations[0].cumulative - 1);
    expect(after.kpis.users).toBe(before.kpis.users - 1);
  });
});
