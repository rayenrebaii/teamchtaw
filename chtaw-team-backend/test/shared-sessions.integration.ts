import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { Client } from "pg";
import { readFile } from "node:fs/promises";
import { AddressInfo } from "node:net";
import { io, Socket } from "socket.io-client";
import { PrismaService } from "../src/prisma/prisma.module";
import { DomainEvents, DomainEvent } from "../src/common/events";
import { MandatoryAttendanceService } from "../src/polls/mandatory-attendance.service";
import { NotificationsWorker } from "../src/notifications/notifications.worker";
import { configureApp } from "../src/bootstrap";

type Identity = { id: string; token: string };
type Session = { id: string; groupIds: string[]; options: { id: string; capacity: number }[]; votes: { userId: string; optionIds: string[] }[] };
describe("Shared sessions: isolated PostgreSQL and real HTTP authentication", () => {
  let app: INestApplication, db: PrismaService;
  let admin: Identity, coach: Identity, otherCoach: Identity, outsider: Identity;
  let students: Identity[], groups: string[], release: () => void;
  const events: DomainEvent[] = [];
  let schedule = 0;
  const api = () => request(app.getHttpServer());
  const auth = (actor: Identity) => ({ Authorization: `Bearer ${actor.token}` });
  const input = (ids: string[] = groups.slice(0, 2), capacities = [1, 10]) => {
    const start = Date.now() + (500 + ++schedule) * 86400000;
    return { type: "SESSION", mandatoryAttendance: true, question: "Shared training", singleChoice: true, status: "OPEN", groupIds: ids,
      options: ["H1", "H2"], capacities, startsAt: [0, 2].map(hours => new Date(start + hours * 3600000).toISOString()) };
  };
  const create = async (data = input(), actor = coach): Promise<Session> => {
    const poll = (await api().post(`/api/v1/groups/${data.groupIds[0]}/polls`).set(auth(actor)).send(data).expect(201)).body as Session;
    for (const option of poll.options) await api().post(`/api/v1/polls/${poll.id}/options/${option.id}/validate`).set(auth(actor)).expect(201);
    return poll;
  };
  const cast = (poll: Session, actor: Identity, optionIds: string[], replace = false) =>
    api()[replace ? "put" : "post"](`/api/v1/polls/${poll.id}/votes`).set(auth(actor)).send({ optionIds });
  const add = (poll: Session, actor: Identity, groupIds: string[]) =>
    api().post(`/api/v1/polls/${poll.id}/groups`).set(auth(actor)).send({ groupIds });
  const finish = async (poll: Session) => {
    for (const [index, option] of poll.options.entries()) await db.pollOption.update({ where: { id: option.id }, data: {
      startsAt: new Date(Date.now() - (6 - index * 2) * 3600000), endsAt: new Date(Date.now() - (5 - index * 2) * 3600000),
    } });
  };
  const mark = async (poll: Session, student: Identity, statuses: ("PRESENT" | "ABSENT")[]) => {
    const person = await db.sessionParticipant.findUniqueOrThrow({ where: { pollId_userId: { pollId: poll.id, userId: student.id } }, include: { marks: true } });
    return api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth(coach)).send({ entries: statuses.slice(0, 1).map((status, index) => ({
      userId: student.id, optionId: poll.options[index]!.id, status, version: person.marks.find(row => row.optionId === poll.options[index]!.id)?.version ?? 0, participantVersion: person.version,
    })) });
  };
  beforeAll(async () => {
    const name = process.env.ISOLATED_TEST_DATABASE;
    if (!name || !/^chtaw_test_[a-f0-9]{12}$/.test(name) || new URL(process.env.TEST_DATABASE_URL!).pathname !== `/${name}`) throw Error("Use the isolated runner.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(ThrottlerStorage)
      .useValue({ increment: async () => ({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 }) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.listen(0, "127.0.0.1"); db = app.get(PrismaService);
    const password = "Disposable-Shared-Training-2026!", passwordHash = await hash(password);
    const identity = async (role: "ADMIN" | "COLLABORATOR" | "USER"): Promise<Identity> => {
      const user = await db.user.create({ data: { email: `${randomUUID()}@shared.invalid`, passwordHash, role, status: "APPROVED", emailVerified: true,
        firstName: "Shared", lastName: "Fixture", ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      const login = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      return { id: user.id, token: login.body.accessToken };
    };
    admin = await identity("ADMIN"); coach = await identity("COLLABORATOR"); otherCoach = await identity("COLLABORATOR"); outsider = await identity("USER");
    students = []; for (let index = 0; index < 10; index++) students.push(await identity("USER"));
    groups = [];
    for (let index = 0; index < 4; index++) {
      const group = await db.group.create({ data: { name: `Shared ${index}` } }); groups.push(group.id);
      await db.groupMember.createMany({ data: [coach.id, otherCoach.id, ...students.filter((_, i) => index === 0 ? i < 8 : index === 1 ? i === 0 || i === 8 : i === 0 || i === 9).map(student => student.id)]
        .filter(() => index < 3).map(userId => ({ userId, groupId: group.id })) });
    }
    release = app.get(DomainEvents).subscribe(async event => { events.push(event); });
  });
  afterAll(async () => { release?.(); await app?.close(); });

  it("shares one poll, one snapshot and one ballot across groups, and serializes the last place", async () => {
    const poll = await create(); const [h1, h2] = poll.options;
    expect(poll.groupIds.sort()).toEqual(groups.slice(0, 2).sort());
    expect(await db.poll.count({ where: { id: poll.id } })).toBe(1);
    expect(await db.message.count({ where: { pollId: poll.id } })).toBe(2);
    expect(await db.sessionParticipant.count({ where: { pollId: poll.id } })).toBe(9);
    expect(await db.sessionParticipant.count({ where: { pollId: poll.id, userId: students[0]!.id } })).toBe(1);
    const replies = await Promise.all([cast(poll, students[0]!, [h1!.id]), cast(poll, students[8]!, [h1!.id])]);
    expect(replies.map(reply => reply.status).sort()).toEqual([201, 409]);
    const winner = replies[0]!.status === 201 ? students[0]! : students[8]!;
    const loser = winner.id === students[0]!.id ? students[8]! : students[0]!;
    expect(await db.pollVoteOption.count({ where: { optionId: h1!.id } })).toBe(1);
    await cast(poll, winner, [h1!.id]).expect(409);
    await cast(poll, loser, [h2!.id]).expect(201);
    await cast(poll, winner, [], true).expect(200);
    await cast(poll, loser, [h1!.id], true).expect(200);
    expect(await db.pollVoteOption.count({ where: { optionId: h2!.id } })).toBe(0);
    const secondaryList = (await api().get("/api/v1/polls?limit=100").set(auth(students[8]!)).expect(200)).body;
    expect(secondaryList.items.filter((row: Session) => row.id === poll.id)).toHaveLength(1);
    const history = (await api().get(`/api/v1/attendance/me?groupId=${groups[1]}`).set(auth(students[0]!)).expect(200)).body;
    expect(history.items.filter((row: Session) => row.id === poll.id)).toHaveLength(loser.id === students[0]!.id ? 1 : 0);
    for (const groupId of groups.slice(0, 2)) expect(events).toContainEqual(expect.objectContaining({ name: "poll:updated", groupId, payload: expect.objectContaining({ id: poll.id }) }));
    await api().get(`/api/v1/polls/${poll.id}`).set(auth(outsider)).expect(403);
  });

  it("retains eight reservations when adding a group, deduplicates members, and limits rights", async () => {
    const data = input([groups[0]!], [10, 10]), poll = await create(data);
    for (const student of students.slice(0, 8)) await cast(poll, student, [poll.options[0]!.id]).expect(201);
    await add(poll, students[0]!, [groups[2]!]).expect(403);
    await add(poll, otherCoach, [groups[2]!]).expect(403);
    await add(poll, coach, [groups[3]!]).expect(403);
    const updated = (await add(poll, coach, [groups[2]!]).expect(201)).body;
    expect(updated.votes).toHaveLength(8); expect(updated.options[0].capacity).toBe(10);
    expect((await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).endsAt).toBeNull();
    await add(poll, coach, [groups[2]!]).expect(201);
    expect(await db.message.count({ where: { pollId: poll.id } })).toBe(2);
    expect(await db.sessionParticipant.count({ where: { pollId: poll.id } })).toBe(9);
    await cast(poll, students[9]!, [poll.options[0]!.id]).expect(201);
    await api().patch(`/api/v1/polls/${poll.id}`).set(auth(coach)).send({ ...data, groupIds: undefined, capacities: [8, 10] }).expect(409);
    await add(poll, admin, [groups[1]!]).expect(201);
    await cast(poll, students[8]!, [poll.options[0]!.id]).expect(201);
    expect(await db.pollVoteOption.count({ where: { optionId: poll.options[0]!.id } })).toBe(10);
    await api().get(`/api/v1/polls/${poll.id}/attendance`).set(auth(otherCoach)).expect(403);
    await api().patch(`/api/v1/polls/${poll.id}`).set(auth(otherCoach)).send({ ...data, groupIds: undefined }).expect(403);
  });

  it("removes a voted future slot in every group, protects the last slot and recorded attendance", async () => {
    const poll = await create(); await cast(poll, students[8]!, [poll.options[0]!.id]).expect(201);
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0]!.id}`).set(auth(otherCoach)).expect(403);
    const changed = (await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0]!.id}`).set(auth(admin)).expect(200)).body;
    expect(changed.options).toHaveLength(1); expect(changed.votes).toHaveLength(0);
    expect(await db.sessionParticipant.count({ where: { pollId: poll.id } })).toBe(9);
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[1]!.id}`).set(auth(admin)).expect(409);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    const guarded = await create(); await cast(guarded, students[0]!, [guarded.options[0]!.id]).expect(201); await finish(guarded);
    expect((await mark(guarded, students[0]!, ["PRESENT", "ABSENT"])).status).toBe(200);
    const before = await db.sessionMark.findMany({ where: { pollId: guarded.id }, orderBy: { optionId: "asc" } });
    await api().delete(`/api/v1/polls/${guarded.id}/options/${guarded.options[0]!.id}`).set(auth(admin)).expect(409);
    await add(guarded, admin, [groups[2]!]).expect(409);
    expect(await db.sessionMark.findMany({ where: { pollId: guarded.id }, orderBy: { optionId: "asc" } })).toEqual(before);
    const history = (await api().get("/api/v1/attendance/me").set(auth(students[0]!)).expect(200)).body;
    expect(history.items.find((row: Session) => row.id === guarded.id).final).toBe("PRESENT");
    await db.poll.update({ where: { id: poll.id }, data: { archivedAt: new Date() } });
    await add(poll, admin, [groups[2]!]).expect(404);
  });

  it("counts a single absence per shared session and preserves mandatory reports and reminders", async () => {
    const poll = await create();
    await cast(poll, students[0]!, [poll.options[0]!.id]).expect(201);
    await cast(poll, students[8]!, [poll.options[1]!.id]).expect(201);
    await app.get(NotificationsWorker).work();
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: poll.id, userId: students[0]!.id } })).toBe(3);
    expect(await db.sessionReminderDelivery.count({ where: { sessionId: poll.id, userId: students[8]!.id } })).toBe(3);
    await finish(poll);
    const student = students[0]!;
    const baseline = (await db.absenceState.findUnique({ where: { userId: student.id } }))?.total ?? 0;
    expect((await mark(poll, student, ["ABSENT", "ABSENT"])).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: student.id } })).total).toBe(baseline + 1);
    await app.get(MandatoryAttendanceService).processPoll(poll.id);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: student.id } })).total).toBe(baseline + 1);
    const roster = (await api().get(`/api/v1/polls/${poll.id}/attendance`).set(auth(coach)).expect(200)).body;
    expect(roster.participants.filter((person: { user: { id: string } }) => person.user.id === student.id)).toHaveLength(1);
    expect(roster.groups).toHaveLength(2);
    const reports = (await api().get(`/api/v1/admin/attendance/reports?groupId=${groups[1]}&pollId=${poll.id}`).set(auth(coach)).expect(200)).body;
    expect(new Set(reports.items.map((row: { user: { id: string } }) => row.user.id)).size).toBe(reports.items.length);
  });

  it("delivers the same updated counters to clients in distinct group rooms over Socket.IO", async () => {
    const poll = await create();
    const sockets: Socket[] = [];
    try {
      for (const [actor, groupId] of [[students[1]!, groups[0]!], [students[8]!, groups[1]!]] as const) {
        const socket = io(`http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/community`, { auth: { token: actor.token }, transports: ["websocket"], reconnection: false });
        sockets.push(socket);
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(Error("Socket ready timeout")), 5000);
          socket.once("session:ready", () => { clearTimeout(timer); resolve(); });
          socket.once("connect_error", () => { clearTimeout(timer); reject(Error("Socket connection failed")); });
        });
        const ack = await socket.timeout(5000).emitWithAck("group:join", { groupId }); expect(ack.ok).toBe(true);
      }
      const updates = sockets.map(socket => new Promise<Session>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Shared update timeout")), 5000);
        socket.on("poll:updated", (value: Session) => { if (value.id === poll.id) { clearTimeout(timer); resolve(value); } });
      }));
      await cast(poll, students[0]!, [poll.options[0]!.id]).expect(201);
      const received = await Promise.all(updates);
      expect(received[0]).toEqual(received[1]); expect(received[0]!.votes).toHaveLength(1);
    } finally { for (const socket of sockets) socket.disconnect(); }
  });

  it("leaves ordinary polls single-group with definitive votes", async () => {
    const data = { question: "Ordinary poll", options: ["Yes", "No"], singleChoice: true };
    await api().post(`/api/v1/groups/${groups[0]}/polls`).set(auth(admin)).send({ ...data, groupIds: groups.slice(0, 2) }).expect(400);
    const poll = (await api().post(`/api/v1/groups/${groups[0]}/polls`).set(auth(admin)).send(data).expect(201)).body;
    expect(poll.groupIds).toBeUndefined();
    await cast(poll, students[0]!, [poll.options[0].id]).expect(201);
    await cast(poll, students[0]!, [poll.options[1].id], true).expect(409);
    await add(poll, admin, [groups[1]!]).expect(400);
  });

  it("backfills legacy one-group polls without rewriting their data or inventing capacities", async () => {
    const client = new Client({ connectionString: process.env.TEST_DATABASE_URL }); await client.connect();
    const schema = "shared_migration_" + randomUUID().replace(/-/g, "");
    try {
      await client.query(`CREATE SCHEMA "${schema}"; SET search_path TO "${schema}"`);
      await client.query('CREATE TABLE "Group" (id UUID PRIMARY KEY); CREATE TABLE "Poll" (id UUID PRIMARY KEY, "groupId" UUID NOT NULL, "endsAt" TIMESTAMPTZ); CREATE TABLE "Message" (id UUID PRIMARY KEY, "groupId" UUID NOT NULL, "pollId" UUID); CREATE UNIQUE INDEX "Message_pollId_key" ON "Message" ("pollId"); CREATE TABLE "PollOption" (id UUID PRIMARY KEY, capacity INTEGER);');
      const group = randomUUID(), poll = randomUUID();
      await client.query('INSERT INTO "Group" VALUES ($1)', [group]);
      await client.query('INSERT INTO "Poll" VALUES ($1,$2,NULL)', [poll, group]);
      await client.query('INSERT INTO "Message" VALUES ($1,$2,$3)', [randomUUID(), group, poll]);
      await client.query('INSERT INTO "PollOption" VALUES ($1,NULL)', [randomUUID()]);
      await client.query('CREATE UNIQUE INDEX "Poll_id_groupId_key" ON "Poll" (id,"groupId"); ALTER TABLE "Message" ADD CONSTRAINT "Message_poll_group_fkey" FOREIGN KEY ("pollId","groupId") REFERENCES "Poll" (id,"groupId");');
      const before = (await client.query('SELECT * FROM "PollOption"')).rows;
      await client.query(await readFile("prisma/migrations/20261117140000_shared_session_groups/migration.sql", "utf8"));
      expect((await client.query('SELECT * FROM "PollGroup"')).rows).toEqual([{ pollId: poll, groupId: group }]);
      expect((await client.query('SELECT * FROM "PollOption"')).rows).toEqual(before);
      expect((await client.query('SELECT * FROM "Message"')).rows).toHaveLength(1);
    } finally { await client.end(); }
  });
});
