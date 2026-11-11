import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";

describe("Séances, présences et alertes réelles PostgreSQL", () => {
  let app: INestApplication;
  let db: PrismaService;
  let adminToken: string;
  let studentToken: string;
  let studentId: string;
  let groupId: string;
  const password = "Attendance-Integration-2026!";
  const api = () => request(app.getHttpServer());
  const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
  const input = (count: number) => ({
    type: "SESSION",
    mandatoryAttendance: false,
    status: "OPEN",
    question: `Séance ${randomUUID()}`,
    description: "Séance de test",
    singleChoice: false,
    endsAt: "2099-01-01T10:00:00.000Z",
    options: Array.from({ length: count }, (_, i) => `Horaire ${i + 1}`),
    startsAt: Array.from({ length: count }, (_, i) =>
      new Date(Date.UTC(2099, 0, 2 + i, 10)).toISOString(),
    ),
  });
  let fixtureSchedule = 0;
  async function create(count: number) {
    const scheduled = input(count);
    scheduled.startsAt = scheduled.startsAt.map((value) => new Date(Date.parse(value) + ++fixtureSchedule * 7 * 86400000).toISOString());
    return (
      await api().post(`/api/v1/groups/${groupId}/polls`).set(auth()).send(scheduled).expect(201)
    ).body;
  }
  async function vote(
    poll: { id: string; options: { id: string }[] },
    ids = poll.options.map((o) => o.id),
  ) {
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: ids })
      .expect(201);
  }
  async function roster(id: string) {
    return (await api().get(`/api/v1/polls/${id}/attendance`).set(auth()).expect(200)).body;
  }
  async function mark(id: string, status: string) {
    // Advance the disposable fixture to the pointage period, after its votes were cast.
    await db.poll.update({ where: { id }, data: { endsAt: new Date(Date.now() - 120000) } });
    await db.pollOption.updateMany({ where: { pollId: id, startsAt: { gt: new Date() } }, data: { startsAt: new Date(Date.now() - 60000) } });
    const list = await roster(id);
    const entries = list.slots.flatMap(
      (slot: { id: string; students: { user: { id: string }; version: number }[] }) =>
        slot.students.map((s) => ({
          userId: s.user.id,
          optionId: slot.id,
          status,
          version: s.version,
        })),
    );
    return api().put(`/api/v1/polls/${id}/attendance`).set(auth()).send({ entries });
  }
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1))
      throw Error("A newly created isolated test database is required.");
    process.env.DATABASE_URL = url;
    process.env.NODE_ENV = "test";
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init();
    db = app.get(PrismaService);
    const suffix = randomUUID();
    const admin = await db.user.create({
      data: {
        email: `attendance-admin-${suffix}@test.invalid`,
        passwordHash: await argon2.hash(password),
        firstName: "Admin",
        lastName: "Attendance",
        status: "APPROVED",
        role: "ADMIN",
      },
    });
    const student = await db.user.create({
      data: {
        email: `attendance-student-${suffix}@test.invalid`,
        passwordHash: await argon2.hash(password),
        firstName: "Ahmed",
        lastName: "Attendance",
        status: "APPROVED",
      },
    });
    studentId = student.id;
    adminToken = (
      await api().post("/api/v1/auth/login").send({ email: admin.email, password }).expect(200)
    ).body.accessToken;
    studentToken = (
      await api().post("/api/v1/auth/login").send({ email: student.email, password }).expect(200)
    ).body.accessToken;
    groupId = (
      await api()
        .post("/api/v1/groups")
        .set(auth())
        .send({ name: `Maths ${suffix}` })
        .expect(201)
    ).body.id;
    await api().put(`/api/v1/groups/${groupId}/members/${studentId}`).set(auth()).expect(200);
  });
  afterAll(async () => {
    if (app) await app.close();
  });

  it.each([1, 2, 3, 5, 10])(
    "génère les listes uniquement pour les %i horaires choisis",
    async (count) => {
      const poll = await create(count);
      await vote(poll);
      const list = await roster(poll.id);
      expect(list.slots).toHaveLength(count);
      for (const slot of list.slots) {
        expect(slot.students).toHaveLength(1);
        expect(slot.students[0].attendance).toBe("NON_VERIFIE");
      }
    },
  );
  it("interdit aussi le pointage anticipé pour les anciennes séances sur inscription", async () => {
    const poll = await create(1);
    await vote(poll);
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries: [{ userId: studentId, optionId: poll.options[0].id, status: "PRESENT", version: 0 }] }).expect(409);
    expect(await db.attendanceEdit.count({ where: { selection: { pollId: poll.id } } })).toBe(0);
    expect((await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).attendanceLockedAt).toBeNull();
  });
  it("synchronise un vote modifié puis verrouille au premier pointage et protège les versions", async () => {
    const poll = await create(3);
    await vote(poll, [poll.options[0].id]);
    await api()
      .put(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: [poll.options[1].id, poll.options[2].id] })
      .expect(200);
    let list = await roster(poll.id);
    expect(list.slots[0].students).toHaveLength(0);
    expect(list.slots[1].students).toHaveLength(1);
    const entry = { userId: studentId, optionId: poll.options[1].id, status: "ABSENT", version: 0 };
    await db.poll.update({ where: { id: poll.id }, data: { endsAt: new Date(Date.now() - 120000) } });
    await db.pollOption.updateMany({ where: { pollId: poll.id }, data: { startsAt: new Date(Date.now() - 60000) } });
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance`)
      .set(auth())
      .send({ entries: [entry] })
      .expect(200);
    list = await roster(poll.id);
    expect(list.slots[1].students[0].final).toBe("EN_ATTENTE");
    await api()
      .put(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: [poll.options[0].id] })
      .expect(409);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance`)
      .set(auth())
      .send({ entries: [{ ...entry, status: "PRESENT" }] })
      .expect(409);
    const concurrent = await Promise.all(
      ["PRESENT", "NON_VERIFIE"].map((status) =>
        api()
          .put(`/api/v1/polls/${poll.id}/attendance`)
          .set(auth())
          .send({ entries: [{ ...entry, status, version: 1 }] }),
      ),
    );
    expect(concurrent.map((r) => r.status).sort()).toEqual([200, 409]);
    // Ensure the final rule regardless of which administrator won the concurrent request.
    expect((await mark(poll.id, "PRESENT")).status).toBe(200);
    const history = (
      await api().get(`/api/v1/users/${studentId}/attendance`).set(auth()).expect(200)
    ).body;
    expect(history.sessions.find((s: { id: string }) => s.id === poll.id).final).toBe("PRESENT");
    expect(await db.attendanceEdit.count()).toBeGreaterThan(0);
  });
  it("compte une absence par sondage, alerte à trois, résout après correction et réalerte une seule fois", async () => {
    const polls = [];
    for (const count of [1, 3, 5]) {
      const poll = await create(count);
      polls.push(poll);
      await vote(poll);
      const response = await mark(poll.id, "ABSENT");
      expect(response.status).toBe(200);
    }
    let alerts = await db.absenceAlert.findMany({ where: { userId: studentId } });
    expect(alerts).toHaveLength(1);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      3,
    );
    await api().get("/api/v1/admin/absence-alerts").set(auth()).expect(200);
    await api().get("/api/v1/admin/attendance").set(auth()).expect(200);
    const filtered = await api()
      .get(
        `/api/v1/admin/attendance?pollId=${polls[0]!.id}&groupId=${groupId}&threshold=true&search=AHMED&limit=1&page=1`,
      )
      .set(auth())
      .expect(200);
    expect(filtered.body.items[0].user.id).toBe(studentId);
    expect(filtered.body.items[0].absences).toBe(1);
    expect(filtered.body.items[0].totalAbsences).toBe(3);
    expect(filtered.body.total).toBe(1);
    expect(await db.absenceAlert.count({ where: { userId: studentId } })).toBe(1);
    await api().patch(`/api/v1/admin/absence-alerts/${alerts[0]!.id}/read`).set(auth()).expect(200);
    const first = polls[0]!;
    let response = await mark(first.id, "PRESENT");
    expect(response.status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      2,
    );
    expect(
      (await db.absenceAlert.findUniqueOrThrow({ where: { id: alerts[0]!.id } })).resolvedAt,
    ).not.toBeNull();
    response = await mark(first.id, "ABSENT");
    expect(response.status).toBe(200);
    alerts = await db.absenceAlert.findMany({ where: { userId: studentId } });
    expect(alerts).toHaveLength(2);
    response = await mark(first.id, "ABSENT");
    expect(response.status).toBe(200);
    expect(await db.absenceAlert.count({ where: { userId: studentId } })).toBe(2);
    const poll = (await api().get(`/api/v1/polls/${first.id}`).set(auth()).expect(200)).body;
    await api()
      .patch(`/api/v1/polls/${first.id}`)
      .set(auth())
      .send({
        ...input(1),
        question: poll.question,
        endsAt: poll.endsAt,
        options: poll.options.map((o: { label: string }) => o.label),
        startsAt: poll.options.map((o: { startsAt: string }) => o.startsAt),
        status: "CANCELLED",
      })
      .expect(409);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      3,
    );
    const history = (
      await api().get(`/api/v1/users/${studentId}/attendance`).set(auth()).expect(200)
    ).body;
    expect(history.absences).toBe(3);
    expect(history.sessions.find((p: { id: string }) => p.id === first.id).final).toBe("ABSENT");
  });
  it("contrôle autorisations, non-inscrits, retraits de groupe et anciens sondages", async () => {
    const poll = await create(2);
    await api().get(`/api/v1/polls/${poll.id}/attendance`).expect(401);
    await api().get(`/api/v1/polls/${poll.id}/attendance`).set(auth(studentToken)).expect(403);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance`)
      .set(auth(studentToken))
      .send({
        entries: [
          { userId: studentId, optionId: poll.options[0].id, status: "PRESENT", version: 0 },
        ],
      })
      .expect(403);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance`)
      .set(auth())
      .send({
        entries: [
          { userId: studentId, optionId: poll.options[0].id, status: "ABSENT", version: 0 },
        ],
      })
      .expect(400);
    let history = (await api().get("/api/v1/attendance/me").set(auth(studentToken)).expect(200))
      .body;
    expect(history.sessions.find((p: { id: string }) => p.id === poll.id).final).toBe(
      "NON_INSCRIT",
    );
    await vote(poll, [poll.options[0].id]);
    await api()
      .patch(`/api/v1/polls/${poll.id}`)
      .set(auth())
      .send({ ...input(3) })
      .expect(409);
    await api().delete(`/api/v1/groups/${groupId}/members/${studentId}`).set(auth()).expect(200);
    await api()
      .put(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: [poll.options[1].id] })
      .expect(403);
    expect((await roster(poll.id)).slots[0].students).toHaveLength(1);
    history = (await api().get("/api/v1/attendance/me").set(auth(studentToken)).expect(200)).body;
    expect(history.sessions.some((p: { id: string }) => p.id === poll.id)).toBe(true);
    await api().put(`/api/v1/groups/${groupId}/members/${studentId}`).set(auth()).expect(200);
    const ordinary = (
      await api()
        .post(`/api/v1/groups/${groupId}/polls`)
        .set(auth())
        .send({
          question: "Ancien sondage compatible ?",
          options: ["Oui", "Non"],
          singleChoice: true,
        })
        .expect(201)
    ).body;
    await vote(ordinary, [ordinary.options[0].id]);
    await api()
      .put(`/api/v1/polls/${ordinary.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: [ordinary.options[1].id] })
      .expect(409);
    await api().get(`/api/v1/polls/${ordinary.id}/attendance`).set(auth()).expect(400);
  });
  it("modifie les horaires avant le premier vote et impose la date limite", async () => {
    const poll = await create(1);
    const updated = input(10);
    updated.startsAt = updated.startsAt.map((value) => new Date(Date.parse(value) + 730 * 86400000).toISOString());
    const changed = await api()
      .patch(`/api/v1/polls/${poll.id}`)
      .set(auth())
      .send(updated)
      .expect(200);
    expect(changed.body.options).toHaveLength(10);
    await db.poll.update({
      where: { id: poll.id },
      data: { endsAt: new Date(Date.now() - 60000) },
    });
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(studentToken))
      .send({ optionIds: [changed.body.options[0].id] })
      .expect(409);
  });
});
