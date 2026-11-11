import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { hash } from "argon2";
import { io } from "socket.io-client";
import { AddressInfo } from "node:net";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Final session audit: real HTTP and PostgreSQL", () => {
  let app: INestApplication, db: PrismaService;
  type Identity = { id: string; token: string };
  let admin: Identity, otherAdmin: Identity, collab: Identity, otherCollab: Identity, student: Identity;
  let groupId: string, remoteId: string, inaccessibleId: string;
  let limiter = new ThrottlerStorageService();
  let schedule = 0;
  const api = () => request(app.getHttpServer());
  const auth = (actor: Identity) => ({ Authorization: `Bearer ${actor.token}` });
  const input = () => {
    const start = Date.now() + (++schedule + 300) * 86400000;
    return { type: "SESSION", mandatoryAttendance: true, question: `Audit ${randomUUID()}`, status: "OPEN", singleChoice: false,
      endsAt: new Date(start - 3600000).toISOString(), options: ["First", "Second"],
      startsAt: [0, 2].map((hours) => new Date(start + hours * 3600000).toISOString()),
      slotEndsAt: [1, 3].map((hours) => new Date(start + hours * 3600000).toISOString()) };
  };
  const publish = async (actor = collab, group = groupId, data = input()) => {
    const response = await api().post(`/api/v1/groups/${group}/polls`).set(auth(actor)).send(data).expect(201);
    return { poll: response.body as { id: string; options: { id: string }[] }, data };
  };
  const finish = async (id: string) => {
    const options = await db.pollOption.findMany({ where: { pollId: id }, orderBy: { position: "asc" } });
    await db.poll.update({ where: { id }, data: { endsAt: new Date(Date.now() - 8 * 3600000) } });
    for (const [index, option] of options.entries()) await db.pollOption.update({ where: { id: option.id }, data: {
      startsAt: new Date(Date.now() - (6 - index * 2) * 3600000), endsAt: new Date(Date.now() - (5 - index * 2) * 3600000),
    } });
  };
  const mark = async (id: string, status: "PRESENT" | "ABSENT", firstOnly = false) => {
    const poll = await db.poll.findUniqueOrThrow({ where: { id }, include: { options: { orderBy: { position: "asc" } }, participants: { where: { userId: student.id }, include: { marks: true } } } });
    const person = poll.participants[0]!;
    const options = firstOnly ? poll.options.slice(0, 1) : poll.options;
    return api().put(`/api/v1/polls/${id}/attendance`).set(auth(collab)).send({ entries: options.map((option) => ({
      userId: student.id, optionId: option.id, status, version: person.marks.find((m) => m.optionId === option.id)?.version ?? 0, participantVersion: person.version,
    })) });
  };

  beforeAll(async () => {
    const name = process.env.ISOLATED_TEST_DATABASE;
    if (!name || !/^chtaw_test_[a-f0-9]{12}$/.test(name) || new URL(process.env.TEST_DATABASE_URL!).pathname !== `/${name}`)
      throw Error("Run through the owned isolated test runner.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.listen(0, "127.0.0.1"); db = app.get(PrismaService);
    const password = "Audit-Disposable-Password-2026!", passwordHash = await hash(password);
    const identity = async (role: "ADMIN" | "COLLABORATOR" | "USER"): Promise<Identity> => {
      const email = `${randomUUID()}@audit.invalid`;
      const user = await db.user.create({ data: { email, passwordHash, firstName: "Audit", lastName: "Fixture", role, status: "APPROVED", emailVerified: true, ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      const login = await api().post("/api/v1/auth/login").send({ email, password }).expect(200);
      return { id: user.id, token: login.body.accessToken };
    };
    admin = await identity("ADMIN"); otherAdmin = await identity("ADMIN");
    collab = await identity("COLLABORATOR"); otherCollab = await identity("COLLABORATOR"); student = await identity("USER");
    groupId = (await db.group.create({ data: { name: "Audit group", members: { create: [collab, otherCollab, student].map((actor) => ({ userId: actor.id })) } } })).id;
    remoteId = (await db.group.create({ data: { name: "Remote audit group", members: { create: [{ userId: collab.id }, { userId: student.id }] } } })).id;
    inaccessibleId = (await db.group.create({ data: { name: "No collaborator access" } })).id;
    // Neither administrator has any membership rows in these fixture groups.
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it("gives unassigned administrators every group, while non-admins still require membership", async () => {
    const groups = (await api().get("/api/v1/groups").set(auth(admin)).expect(200)).body;
    expect(groups.map((group: { id: string }) => group.id)).toEqual(expect.arrayContaining([groupId, remoteId, inaccessibleId]));
    for (const group of [groupId, remoteId, inaccessibleId]) {
      await api().get(`/api/v1/groups/${group}`).set(auth(admin)).expect(200);
      await api().get(`/api/v1/groups/${group}/messages`).set(auth(admin)).expect(200);
    }
    await api().get(`/api/v1/groups/${inaccessibleId}`).set(auth(collab)).expect(403);
    await api().get(`/api/v1/groups/${inaccessibleId}`).set(auth(student)).expect(403);
    const { poll, data } = await publish(admin, inaccessibleId);
    await api().patch(`/api/v1/polls/${poll.id}`).set(auth(admin)).send({ ...data, question: "Own session edited" }).expect(200);
    await api().get(`/api/v1/polls/${poll.id}/attendance`).set(auth(admin)).expect(200);
    const sessions = (await api().get(`/api/v1/admin/attendance/sessions?pollId=${poll.id}`).set(auth(admin)).expect(200)).body;
    expect(sessions.items.map((item: { id: string }) => item.id)).toContain(poll.id);
    expect(await db.groupMember.count({ where: { userId: admin.id, groupId: inaccessibleId } })).toBe(0);
  });

  it("authorizes an unassigned admin over Socket.IO while rejecting unassigned collaborators", async () => {
    const origin = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/community`;
    const connect = async (actor: Identity) => {
      const socket = io(origin, { auth: { token: actor.token }, transports: ["websocket"], reconnection: false, forceNew: true });
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { socket.disconnect(); reject(Error("Socket ready timeout")); }, 5000);
        socket.once("session:ready", () => { clearTimeout(timer); resolve(); });
        socket.once("connect_error", () => { clearTimeout(timer); socket.disconnect(); reject(Error("Socket connection failed")); });
      });
      return socket;
    };
    const administrator = await connect(admin), collaborator = await connect(collab);
    try {
      const joined = await administrator.timeout(5000).emitWithAck("group:join", { groupId: inaccessibleId });
      expect(joined.ok).toBe(true);
      const denied = await collaborator.timeout(5000).emitWithAck("group:join", { groupId: inaccessibleId });
      expect(denied.ok).toBe(false);
      const event = new Promise<{ id: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error("Poll delivery timeout")), 5000);
        administrator.once("poll:created", (poll) => { clearTimeout(timer); resolve(poll); });
      });
      const { poll } = await publish(admin, inaccessibleId);
      expect((await event).id).toBe(poll.id);
    } finally { administrator.disconnect(); collaborator.disconnect(); }
  });
  it("enforces ownership for every admin and collaborator mutation, without granting an admin ownership bypass", async () => {
    const actors = [admin, otherAdmin, collab, otherCollab];
    for (const owner of actors) {
      const { poll, data } = await publish(owner);
      for (const stranger of actors.filter((actor) => actor.id !== owner.id)) {
        const base = `/api/v1/polls/${poll.id}`;
        await api().patch(base).set(auth(stranger)).send(data).expect(403);
        await api().patch(base).set(auth(stranger)).send({ ...data, status: "CANCELLED" }).expect(403);
        await api().get(`${base}/attendance`).set(auth(stranger)).expect(403);
        await api().put(`${base}/attendance`).set(auth(stranger)).send({ entries: [{ userId: student.id, optionId: poll.options[0]!.id, status: "PRESENT", version: 0, participantVersion: 0 }] }).expect(403);
        await api().put(`${base}/attendance/absence/${student.id}`).set(auth(stranger)).send({ version: 0 }).expect(403);
        await api().put(`${base}/attendance/participants/${student.id}`).set(auth(stranger)).send({ version: 0, included: false }).expect(403);
        await api().delete(`${base}/options/${poll.options[0]!.id}`).set(auth(stranger)).expect(403);
      }
      await api().get(`/api/v1/polls/${poll.id}/attendance`).set(auth(owner)).expect(200);
    }
  });

  it("lets an unassigned admin delete collaborators' sessions in any group, subject to timing gates", async () => {
    const { poll } = await publish(collab, remoteId);
    const listed = (await api().get("/api/v1/polls?limit=100").set(auth(admin)).expect(200)).body.items;
    expect(listed.some((item: { id: string }) => item.id === poll.id)).toBe(true);
    await api().delete(`/api/v1/polls/${poll.id}`).expect(401);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth(otherCollab)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth(admin)).expect(204);
    expect(await db.poll.findUnique({ where: { id: poll.id } })).toBeNull();
    const locked = await publish(collab, remoteId);
    await db.pollOption.update({ where: { id: locked.poll.options[0]!.id }, data: { startsAt: new Date(Date.now() + 3600000), endsAt: new Date(Date.now() + 7200000) } });
    await api().delete(`/api/v1/polls/${locked.poll.id}`).set(auth(admin)).expect(409);
    expect(await db.poll.count({ where: { id: locked.poll.id } })).toBe(1);
    const own = await publish(otherCollab);
    await api().delete(`/api/v1/polls/${own.poll.id}`).set(auth(collab)).expect(403);
    await api().delete(`/api/v1/polls/${own.poll.id}`).set(auth(otherCollab)).expect(204);
  });

  it("rejects invalid ends and internal overlaps, and preserves legacy end times when edited", async () => {
    const data = input();
    const path = `/api/v1/groups/${groupId}/polls`;
    await api().post(path).set(auth(collab)).send({ ...data, slotEndsAt: [data.startsAt[0], data.slotEndsAt[1]] }).expect(400);
    await api().post(path).set(auth(collab)).send({ ...data, startsAt: [data.startsAt[0], new Date(Date.parse(data.startsAt[0]!) + 1800000).toISOString()] }).expect(400);
    await api().post(path).set(auth(collab)).send({ ...data, mandatoryAttendance: false, slotEndsAt: [data.slotEndsAt[0]] }).expect(400);
    const legacy = await publish(collab, groupId, { ...data, mandatoryAttendance: false });
    const edited = { ...legacy.data, slotEndsAt: legacy.data.slotEndsAt.map((value) => new Date(Date.parse(value) + 60000).toISOString()) };
    await api().patch(`/api/v1/polls/${legacy.poll.id}`).set(auth(collab)).send(edited).expect(200);
    const stored = await db.pollOption.findMany({ where: { pollId: legacy.poll.id }, orderBy: { position: "asc" } });
    expect(stored.map((option) => option.endsAt!.toISOString())).toEqual(edited.slotEndsAt);
  });

  it("serializes conflicting creation across organizers but allows identical schedules in different groups", async () => {
    const data = input();
    const create = (actor: Identity, group: string) => api().post(`/api/v1/groups/${group}/polls`).set(auth(actor)).send(data);
    const results = await Promise.all([create(admin, groupId), create(collab, groupId)]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    await create(admin, remoteId).expect(201);
    const adjacent = { ...data, startsAt: data.slotEndsAt, slotEndsAt: data.slotEndsAt.map((value) => new Date(Date.parse(value) + 1800000).toISOString()) };
    await api().post(`/api/v1/groups/${groupId}/polls`).set(auth(otherCollab)).send(adjacent).expect(201);
  });

  it("protects votes, rejects premature attendance and prevents votes after closing", async () => {
    const { poll } = await publish();
    const path = `/api/v1/polls/${poll.id}/votes`;
    await api().post(path).set(auth(admin)).send({ optionIds: [poll.options[0]!.id] }).expect(400);
    await api().post(path).set(auth(student)).send({ optionIds: [poll.options[0]!.id] }).expect(201);
    await api().post(path).set(auth(student)).send({ optionIds: [poll.options[1]!.id] }).expect(409);
    await api().put(path).set(auth(student)).send({ optionIds: poll.options.map((option) => option.id) }).expect(200);
    const foreign = await publish();
    await api().put(path).set(auth(student)).send({ optionIds: [foreign.poll.options[0]!.id] }).expect(400);
    expect(await db.pollVote.count({ where: { pollId: poll.id, userId: student.id } })).toBe(1);
    await mark(poll.id, "PRESENT").then((response) => expect(response.status).toBe(409));
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    await db.poll.update({ where: { id: poll.id }, data: { endsAt: new Date(Date.now() - 1000) } });
    await api().put(path).set(auth(student)).send({ optionIds: [poll.options[0]!.id] }).expect(409);
  });

  it("counts one absence per session, corrects alerts and preserves results in immutable archives", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const { poll } = await publish(); ids.push(poll.id); await finish(poll.id);
      await mark(poll.id, "ABSENT").then((response) => expect(response.status).toBe(200));
    }
    const state = () => db.organizerAbsenceState.findUniqueOrThrow({ where: { userId_organizerId: { userId: student.id, organizerId: collab.id } } });
    expect((await state()).total).toBe(3);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: student.id, organizerId: collab.id, resolvedAt: null } })).toBe(1);
    await mark(ids[0]!, "PRESENT", true).then((response) => expect(response.status).toBe(200));
    expect((await state()).total).toBe(2);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: student.id, organizerId: collab.id, resolvedAt: null } })).toBe(0);
    const history = (await api().get(`/api/v1/users/${student.id}/attendance`).set(auth(collab)).expect(200)).body;
    expect(history.sessions.find((session: { id: string }) => session.id === ids[0]).final).toBe("PRESENT");
    await mark(ids[0]!, "ABSENT", true).then((response) => expect(response.status).toBe(200));
    expect((await state()).total).toBe(3);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: student.id, organizerId: collab.id, resolvedAt: null } })).toBe(1);
    const id = ids[2]!;
    await api().delete(`/api/v1/polls/${id}`).set(auth(admin)).expect(204);
    const snapshot = () => db.poll.findUniqueOrThrow({ where: { id }, include: { participants: { include: { marks: true, edits: true } }, options: true } });
    const archived = await snapshot();
    expect(archived.archivedAt).not.toBeNull();
    expect((await state()).total).toBe(3);
    const entry = { userId: student.id, optionId: archived.options[0]!.id, status: "PRESENT", version: 0, participantVersion: 0 };
    await api().put(`/api/v1/polls/${id}/attendance`).set(auth(collab)).send({ entries: [entry] }).expect(404);
    await api().put(`/api/v1/polls/${id}/attendance/participants/${student.id}`).set(auth(collab)).send({ included: false, version: 0 }).expect(404);
    await api().put(`/api/v1/polls/${id}/attendance/absence/${student.id}`).set(auth(collab)).send({ version: 0 }).expect(404);
    await api().delete(`/api/v1/polls/${id}/options/${archived.options[0]!.id}`).set(auth(collab)).expect(404);
    await api().patch(`/api/v1/polls/${id}`).set(auth(collab)).send(input()).expect(404);
    await api().delete(`/api/v1/polls/${id}`).set(auth(admin)).expect(404);
    expect(await snapshot()).toEqual(archived);
    const personal = (await api().get("/api/v1/attendance/me").set(auth(student)).expect(200)).body;
    expect(personal.sessions.find((session: { id: string }) => session.id === id)).toMatchObject({ final: "ABSENT", archivedAt: expect.any(String) });
    expect((await state()).total).toBe(3);
    // Group deletion preserves archives. Explicit account deletion intentionally erases history.
    await api().delete(`/api/v1/groups/${groupId}`).set(auth(admin)).expect(409);
    expect(await snapshot()).toEqual(archived);
    const remainingStudent = await db.user.create({ data: {
      email: `${randomUUID()}@audit.invalid`, passwordHash: await hash("Audit-Remaining-Fixture-2026!"), firstName: "Remaining", lastName: "Student", role: "USER", status: "APPROVED",
      memberships: { create: { groupId } },
    } });
    await api().put(`/api/v1/polls/${ids[1]}/attendance/participants/${remainingStudent.id}`).set(auth(collab)).send({ included: true, version: 0 }).expect(200);
    await api().put(`/api/v1/polls/${ids[1]}/attendance/absence/${remainingStudent.id}`).set(auth(collab)).send({ version: 1 }).expect(200);
    const unrelated = await publish(otherCollab); await finish(unrelated.poll.id);
    await api().put(`/api/v1/polls/${unrelated.poll.id}/attendance/absence/${remainingStudent.id}`).set(auth(otherCollab)).send({ version: 0 }).expect(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: remainingStudent.id } })).total).toBe(2);
    await api().delete(`/api/v1/users/${student.id}`).set(auth(admin)).expect(204);
    expect(await db.user.findUnique({ where: { id: student.id } })).toBeNull();
    expect(await db.sessionParticipant.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.sessionMark.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.sessionAttendanceEdit.count({ where: { OR: [{ userId: student.id }, { actorId: student.id }] } })).toBe(0);
    expect(await db.pollVote.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.absenceState.findUnique({ where: { userId: student.id } })).toBeNull();
    expect(await db.organizerAbsenceState.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: student.id } })).toBe(0);
    expect(await db.poll.count({ where: { id } })).toBe(1);
    await api().delete(`/api/v1/users/${collab.id}`).set(auth(admin)).expect(204);
    expect(await db.user.findUnique({ where: { id: collab.id } })).toBeNull();
    expect(await db.poll.count({ where: { authorId: collab.id } })).toBe(0);
    expect(await db.poll.findUnique({ where: { id } })).toBeNull();
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: remainingStudent.id } })).total).toBe(1);
    expect(await db.user.findUnique({ where: { id: remainingStudent.id } })).not.toBeNull();
    expect(await db.poll.findUnique({ where: { id: unrelated.poll.id } })).not.toBeNull();
    expect((await db.organizerAbsenceState.findUniqueOrThrow({ where: { userId_organizerId: { userId: remainingStudent.id, organizerId: otherCollab.id } } })).total).toBe(1);
  });
});
