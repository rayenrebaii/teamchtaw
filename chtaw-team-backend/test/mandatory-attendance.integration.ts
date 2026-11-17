import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { MandatoryAttendanceService } from "../src/polls/mandatory-attendance.service";
import { configureApp } from "../src/bootstrap";

describe("Présences des étudiants inscrits aux créneaux validés", () => {
  let app: INestApplication;
  let db: PrismaService;
  let processor: MandatoryAttendanceService;
  let admin: string, otherAdmin: string, student: string, nonVoter: string;
  let studentId: string, nonVoterId: string, waitingId: string, groupId: string;
  const password = "Mandatory-Attendance-Test-2026!";
  const api = () => request(app.getHttpServer());
  const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
  const input = (count = 3) => ({
    type: "SESSION",
    mandatoryAttendance: true,
    question: `Séance ${randomUUID()}`,
    singleChoice: true,
    capacities: Array(count).fill(10),
    status: "OPEN",
    endsAt: new Date(Date.now() + 1800000).toISOString(),
    options: Array.from({ length: count }, (_, i) => `Créneau ${i + 1}`),
    startsAt: Array.from({ length: count }, (_, i) =>
      new Date(Date.now() + (i + 1) * 2 * 3600000).toISOString(),
    ),
    slotEndsAt: Array.from({ length: count }, (_, i) =>
      new Date(Date.now() + (i + 1) * 2 * 3600000 + 1800000).toISOString(),
    ),
  });
  let fixtureSchedule = 0;
  async function create(count = 3, targetGroupId = groupId) {
    const scheduled = input(count);
    const offset = ++fixtureSchedule * 86400000;
    scheduled.startsAt = scheduled.startsAt.map((value) => new Date(Date.parse(value) + offset).toISOString());
    scheduled.slotEndsAt = scheduled.slotEndsAt.map((value) => new Date(Date.parse(value) + offset).toISOString());
    const poll = (
      await api()
        .post(`/api/v1/groups/${targetGroupId}/polls`)
        .set(auth())
        .send(scheduled)
        .expect(201)
    ).body;
    for (const option of poll.options) await api().post(`/api/v1/polls/${poll.id}/options/${option.id}/validate`).set(auth()).expect(201);
    return poll;
  }
  async function cast(poll: { id: string; options: { id: string }[] }, token = student, index = 0) {
    await api().post(`/api/v1/polls/${poll.id}/votes`).set(auth(token)).send({ optionIds: [poll.options[index]!.id] }).expect(201);
  }
  async function roster(id: string) {
    return (await api().get(`/api/v1/polls/${id}/attendance`).set(auth()).expect(200)).body;
  }
  async function finish(id: string) {
    await db.poll.update({ where: { id }, data: { endsAt: new Date(Date.now() - 10800000) } });
    await db.pollOption.updateMany({
      where: { pollId: id },
      data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) },
    });
  }
  async function mark(id: string, userId: string, status: string, index = 0, token = admin) {
    const list = await roster(id);
    const slot = list.slots[index];
    // Existing correction scenarios take place after this particular fixture slot starts.
    await db.poll.update({ where: { id }, data: { endsAt: new Date(Date.now() - 120000) } });
    await db.pollOption.updateMany({ where: { id: slot.id, startsAt: { gt: new Date() } }, data: { startsAt: new Date(Date.now() - 60000) } });
    const row = slot.students.find((s: { user: { id: string } }) => s.user.id === userId);
    return api()
      .put(`/api/v1/polls/${id}/attendance`)
      .set(auth(token))
      .send({
        entries: [
          {
            userId,
            optionId: slot.id,
            status,
            version: row.version,
            participantVersion: row.participantVersion,
          },
        ],
      });
  }
  async function confirm(id: string, userId: string) {
    const p = await db.sessionParticipant.findUniqueOrThrow({
      where: { pollId_userId: { pollId: id, userId } },
    });
    return api()
      .put(`/api/v1/polls/${id}/attendance/absence/${userId}`)
      .set(auth())
      .send({ version: p.version });
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
    processor = app.get(MandatoryAttendanceService);
    const suffix = randomUUID();
    const hash = await argon2.hash(password);
    const make = (
      name: string,
      role: "ADMIN" | "USER",
      status: "APPROVED" | "PENDING" = "APPROVED",
    ) =>
      db.user.create({
        data: {
          email: `${name}-${suffix}@attendance.invalid`,
          passwordHash: hash,
          firstName: name,
          lastName: "Test",
          role,
          status,
        },
      });
    const a = await make("admin", "ADMIN"),
      b = await make("other-admin", "ADMIN"),
      s = await make("student", "USER"),
      n = await make("nonvoter", "USER"),
      w = await make("waiting", "USER", "PENDING");
    studentId = s.id;
    nonVoterId = n.id;
    waitingId = w.id;
    const login = async (email: string) =>
      (await api().post("/api/v1/auth/login").send({ email, password }).expect(200)).body
        .accessToken as string;
    admin = await login(a.email);
    otherAdmin = await login(b.email);
    student = await login(s.email);
    nonVoter = await login(n.email);
    groupId = (
      await api()
        .post("/api/v1/groups")
        .set(auth())
        .send({ name: `Mandatory ${suffix}` })
        .expect(201)
    ).body.id as string;
    await db.groupMember.createMany({ data: [s, n, w].map((u) => ({ groupId, userId: u.id })) });
  });
  afterAll(async () => {
    await app?.close();
  });

  it("accepte le contrat obligatoire et rejette strictement les champs inconnus et les dates invalides", async () => {
    const valid = input(3);
    const unknown = await api()
      .post(`/api/v1/groups/${groupId}/polls`)
      .set(auth())
      .send({ ...valid, unknownSessionField: true })
      .expect(400);
    expect(JSON.stringify(unknown.body)).toContain("property unknownSessionField should not exist");
    expect(JSON.stringify(unknown.body)).not.toContain(
      "property mandatoryAttendance should not exist",
    );
    expect(JSON.stringify(unknown.body)).not.toContain("property slotEndsAt should not exist");
    for (const patch of [
      { mandatoryAttendance: "true" },
      { slotEndsAt: "2099-01-01T12:00:00Z" },
      { slotEndsAt: ["not-a-date", ...valid.slotEndsAt.slice(1)] },
      { capacities: [0, 10, 10] },
      { capacities: [10] },
      { startsAt: ["invalid", ...valid.startsAt.slice(1)] },
    ])
      await api()
        .post(`/api/v1/groups/${groupId}/polls`)
        .set(auth())
        .send({ ...valid, ...patch })
        .expect(400);
    const response = await api()
      .post(`/api/v1/groups/${groupId}/polls`)
      .set(auth())
      .send(valid)
      .expect(201);
    expect(response.body.mandatoryAttendance).toBe(true);
    const persisted = await db.poll.findUniqueOrThrow({
      where: { id: response.body.id as string },
      include: { options: { orderBy: { position: "asc" } } },
    });
    expect(persisted.options).toHaveLength(3);
    expect(persisted.options.map((option) => option.endsAt!.toISOString())).toEqual(
      valid.startsAt.map((value) => new Date(Date.parse(value) + 5400000).toISOString()),
    );
    expect(persisted.options.map((option) => option.startsAt!.toISOString())).toEqual(
      valid.startsAt,
    );
  });
  it("fige tous les étudiants approuvés, sans les admins ni les comptes en attente", async () => {
    const poll = await create();
    const list = await roster(poll.id);
    expect(list.participants.map((p: { user: { id: string } }) => p.user.id).sort()).toEqual(
      [studentId, nonVoterId].sort(),
    );
    expect(list.slots).toHaveLength(3);
    expect(list.slots[0].students.every((s: { voted: boolean }) => !s.voted)).toBe(true);
    await db.user.update({ where: { id: waitingId }, data: { status: "APPROVED" } });
    expect((await roster(poll.id)).participants).toHaveLength(2);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance/participants/${waitingId}`)
      .set(auth())
      .send({ included: true, version: 0 })
      .expect(200);
    expect((await roster(poll.id)).participants).toHaveLength(3);
    await db.groupMember.delete({ where: { groupId_userId: { groupId, userId: waitingId } } });
    expect((await roster(poll.id)).participants).toHaveLength(3);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance/participants/${waitingId}`)
      .set(auth())
      .send({ included: false, version: 1 })
      .expect(200);
  });
  it("confirme l’absence du créneau choisi et recalcule chaque correction", async () => {
    const poll = await create(2);
    await cast(poll);
    expect((await mark(poll.id, studentId, "ABSENT", 0)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("ABSENT");
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      1,
    );
    expect((await mark(poll.id, studentId, "ABSENT", 0)).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      1,
    );
    expect(
      await db.sessionAttendanceEdit.count({
        where: { pollId: poll.id, userId: studentId, action: "CONFIRM_ALL_SLOTS_ABSENT" },
      }),
    ).toBe(1);
    expect((await mark(poll.id, studentId, "NON_VERIFIE", 0)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("EN_ATTENTE");
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      0,
    );
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("PRESENT");
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      0,
    );
  });
  it("rattrape les pointages tous absents déjà enregistrés sans doubler le compteur ni supprimer l’historique", async () => {
    const poll = await create(2);
    await cast(poll);
    await db.sessionMark.createMany({
      data: poll.options.map((o: { id: string }) => ({
        pollId: poll.id as string,
        userId: studentId,
        optionId: o.id,
        attendance: "ABSENT" as const,
        version: 1,
      })),
    });
    await db.sessionAttendanceEdit.createMany({
      data: poll.options.map((o: { id: string }) => ({
        pollId: poll.id as string,
        userId: studentId,
        optionId: o.id,
        actorId: poll.authorId as string,
        action: "MARK",
        before: "NON_VERIFIE",
        after: "ABSENT",
        version: 1,
      })),
    });
    await processor.processDueSessions();
    await processor.processDueSessions();
    const person = await db.sessionParticipant.findUniqueOrThrow({
      where: { pollId_userId: { pollId: poll.id as string, userId: studentId } },
    });
    expect(person.absenceConfirmedAt).not.toBeNull();
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      1,
    );
    expect(
      await db.sessionAttendanceEdit.count({
        where: { pollId: poll.id, userId: studentId, action: "MARK" },
      }),
    ).toBe(2);
    expect(
      await db.sessionAttendanceEdit.count({
        where: { pollId: poll.id, userId: studentId, action: "CONFIRM_ALL_SLOTS_ABSENT" },
      }),
    ).toBe(1);
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
  });
  it("refuse un non-votant et permet de corriger le créneau choisi", async () => {
    const poll = await create();
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(student))
      .send({ optionIds: [poll.options[0].id] })
      .expect(201);
    const nonVoterEntry = { userId: nonVoterId, optionId: poll.options[1].id, status: "PRESENT", version: 0, participantVersion: 0 };
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries: [nonVoterEntry] }).expect(400);
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
    let list = await roster(poll.id);
    expect(
      list.slots[0].students.find((s: { user: { id: string } }) => s.user.id === studentId).final,
    ).toBe("PRESENT");
    expect(await db.pollVote.count({ where: { pollId: poll.id, userId: nonVoterId } })).toBe(0);
    expect(await db.pollVoteOption.count({ where: { pollId: poll.id } })).toBe(1);
    expect((await mark(poll.id, studentId, "NON_VERIFIE", 0)).status).toBe(200);
    list = await roster(poll.id);
    expect(
      list.slots[0].students.find((s: { user: { id: string } }) => s.user.id === studentId).final,
    ).toBe("EN_ATTENTE");
    expect(
      await db.sessionAttendanceEdit.count({ where: { pollId: poll.id, userId: studentId } }),
    ).toBe(2);
  });
  it("ne signale ni ne confirme une absence avant la fin du dernier créneau", async () => {
    const poll = await create();
    await cast(poll);
    expect((await mark(poll.id, studentId, "ABSENT", 0)).status).toBe(200);
    await processor.processDueSessions();
    expect(
      await db.sessionParticipant.count({
        where: { pollId: poll.id, reportOpenedAt: { not: null } },
      }),
    ).toBe(0);
    expect((await confirm(poll.id, studentId)).status).toBe(409);
    expect((await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0).toBe(
      1,
    );
    await db.pollOption.update({
      where: { id: poll.options[0].id },
      data: { startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 3600000) },
    });
    await processor.processDueSessions();
    expect(
      await db.sessionParticipant.count({
        where: { pollId: poll.id, reportOpenedAt: { not: null } },
      }),
    ).toBe(0);
    expect((await mark(poll.id, studentId, "NON_VERIFIE", 0)).status).toBe(200);
  });
  it("ne signale pas les non-votants après la fin", async () => {
    const poll = await create();
    await finish(poll.id);
    await processor.processDueSessions();
    await processor.processDueSessions();
    const all = await db.sessionParticipant.findMany({ where: { pollId: poll.id } });
    expect(all).toHaveLength(2);
    expect(all.every((p) => !p.reportOpenedAt && !p.absenceConfirmedAt)).toBe(true);
    await db.sessionParticipant.update({
      where: { pollId_userId: { pollId: poll.id, userId: studentId } },
      data: { reportOpenedAt: null },
    });
    await api()
      .get(`/api/v1/admin/attendance/reports?pollId=${poll.id}`)
      .set(auth())
      .expect(200)
      .expect((r) => expect(r.body.total).toBe(0));
    expect((await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0).toBe(
      0,
    );
  });
  it("confirme une absence du votant puis la corrige en présence", async () => {
    const poll = await create();
    await cast(poll, nonVoter, 2);
    await finish(poll.id);
    await processor.processPoll(poll.id);
    expect((await confirm(poll.id, nonVoterId)).status).toBe(200);
    expect((await confirm(poll.id, nonVoterId)).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      1,
    );
    expect((await mark(poll.id, nonVoterId, "PRESENT", 2)).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      0,
    );
    const person = await db.sessionParticipant.findUniqueOrThrow({
      where: { pollId_userId: { pollId: poll.id, userId: nonVoterId } },
    });
    expect(person.absenceConfirmedAt).toBeNull();
    expect(person.reportResolvedAt).not.toBeNull();
    const history = await api()
      .get(`/api/v1/users/${nonVoterId}/attendance`)
      .set(auth())
      .expect(200);
    expect(
      history.body.sessions
        .find((s: { id: string }) => s.id === poll.id)
        .globalEdits.map((e: { action: string }) => e.action),
    ).toEqual(expect.arrayContaining(["CONFIRM_ABSENCE", "CLEAR_ABSENCE"]));
    expect((await confirm(poll.id, nonVoterId)).status).toBe(409);
  });
  it("alerte à trois absences tous groupes confondus et résout après correction ou annulation", async () => {
    const polls = [];
    const secondGroup = (
      await api()
        .post("/api/v1/groups")
        .set(auth())
        .send({ name: `Second ${randomUUID()}` })
        .expect(201)
    ).body.id as string;
    await api().put(`/api/v1/groups/${secondGroup}/members/${nonVoterId}`).set(auth()).expect(200);
    for (let i = 0; i < 3; i++) {
      const p = await create(1, i === 2 ? secondGroup : groupId);
      await cast(p, nonVoter);
      await finish(p.id);
      polls.push(p);
      expect((await confirm(p.id, nonVoterId)).status).toBe(200);
    }
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      3,
    );
    expect(await db.absenceAlert.count({ where: { userId: nonVoterId, resolvedAt: null } })).toBe(
      1,
    );
    expect((await db.user.findUniqueOrThrow({ where: { id: nonVoterId } })).status).toBe(
      "APPROVED",
    );
    expect((await confirm(polls[2].id, nonVoterId)).status).toBe(200);
    expect(await db.absenceAlert.count({ where: { userId: nonVoterId, resolvedAt: null } })).toBe(
      1,
    );
    expect((await mark(polls[0].id, nonVoterId, "PRESENT")).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      2,
    );
    expect(await db.absenceAlert.count({ where: { userId: nonVoterId, resolvedAt: null } })).toBe(
      0,
    );
    const p = await db.poll.findUniqueOrThrow({
      where: { id: polls[1].id },
      include: { options: { orderBy: { position: "asc" } } },
    });
    await api()
      .patch(`/api/v1/polls/${p.id}`)
      .set(auth())
      .send({
        ...input(1),
        question: p.question,
        status: "CANCELLED",
        endsAt: p.endsAt!.toISOString(),
        options: p.options.map((o) => o.label),
        startsAt: p.options.map((o) => o.startsAt!.toISOString()),
        slotEndsAt: p.options.map((o) => o.endsAt!.toISOString()),
      })
      .expect(409);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      2,
    );
    expect(
      await db.sessionAttendanceEdit.count({ where: { pollId: p.id, action: "CANCEL_SESSION" } }),
    ).toBe(0);
  });
  it("bloque les pointages futurs et annule intégralement un lot qui contient un créneau non commencé", async () => {
    const poll = await create(2);
    await cast(poll);
    await cast(poll, nonVoter, 1);
    const list = await roster(poll.id);
    const entries = list.slots.map((slot: { id: string; students: { user: { id: string }; version: number; participantVersion: number }[] }, index: number) => {
      const row = slot.students.find((person) => person.user.id === (index === 0 ? studentId : nonVoterId))!;
      return { userId: row.user.id, optionId: slot.id, status: "PRESENT", version: row.version, participantVersion: row.participantVersion };
    });
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries }).expect(409);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    await db.pollOption.update({ where: { id: entries[0]!.optionId }, data: { startsAt: new Date(Date.now() - 1000) } });
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries }).expect(409);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    expect((await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).attendanceLockedAt).toBeNull();
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries: [entries[0]] }).expect(200);
  });
  it("removes a future slot and archives completed attendance", async () => {
    const poll = await create(2);
    await api().post(`/api/v1/polls/${poll.id}/votes`).set(auth(student)).send({ optionIds: [poll.options[0].id] }).expect(201);
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}/options/${randomUUID()}`).set(auth()).expect(404);
    const remaining = await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth()).expect(200);
    expect(remaining.body.options.map((option: { id: string }) => option.id)).toEqual([poll.options[1].id]);
    expect(remaining.body.votes).toHaveLength(0);
    await api().post(`/api/v1/polls/${poll.id}/votes`).set(auth(student)).send({ optionIds: [poll.options[1].id] }).expect(201);
    await finish(poll.id);
    const before = (await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0;
    expect((await mark(poll.id, studentId, "ABSENT")).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before + 1);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth()).expect(204);
    expect((await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).archivedAt).not.toBeNull();
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(1);
    expect(await db.sessionAttendanceEdit.count({ where: { pollId: poll.id } })).toBeGreaterThan(0);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before + 1);
    const history = (await api().get(`/api/v1/users/${studentId}/attendance`).set(auth()).expect(200)).body;
    expect(history.sessions.find((session: { id: string }) => session.id === poll.id)).toBeDefined();
  });
  it("refuses removing a started slot and preserves recorded presence and absence history", async () => {
    const poll = await create(2);
    await cast(poll);
    await finish(poll.id);
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
    const before = (await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0;
    const marks = await db.sessionMark.findMany({ where: { pollId: poll.id } });
    const edits = await db.sessionAttendanceEdit.findMany({ where: { pollId: poll.id } });
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth()).expect(409);
    expect(await db.sessionMark.findMany({ where: { pollId: poll.id } })).toEqual(marks);
    expect(await db.sessionAttendanceEdit.findMany({ where: { pollId: poll.id } })).toEqual(edits);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth()).expect(204);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before);
  });
  it("blocks concurrent duplicates in one group but permits identical schedules in distinct groups", async () => {
    const groups: string[] = [];
    for (let index = 0; index < 2; index++) {
      const response = await api().post("/api/v1/groups").set(auth()).send({ name: `Schedule ${randomUUID()}` }).expect(201);
      groups.push(response.body.id);
      await db.groupMember.create({ data: { groupId: response.body.id, userId: studentId } });
    }
    const scheduled = input(2);
    scheduled.startsAt = scheduled.startsAt.map((value) => new Date(Date.parse(value) + 3 * 3600000).toISOString());
    scheduled.slotEndsAt = scheduled.slotEndsAt.map((value) => new Date(Date.parse(value) + 3 * 3600000).toISOString());
    const publish = (id: string, data = scheduled) => api().post(`/api/v1/groups/${id}/polls`).set(auth()).send(data);
    const attempts = await Promise.all([publish(groups[0]!), publish(groups[0]!)]);
    expect(attempts.map((response) => response.status).sort()).toEqual([201, 409]);
    const first = attempts.find((response) => response.status === 201)!.body;
    const second = (await publish(groups[1]!).expect(201)).body;
    for (const poll of [first, second]) {
      await api().post(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}/validate`).set(auth()).expect(201);
      await cast(poll);
    }
    const overlap = { ...scheduled, startsAt: scheduled.startsAt.map((date) => new Date(Date.parse(date) + 60000).toISOString()) };
    await publish(groups[0]!, overlap).expect(409);
    // Adjacent slots with matching endpoints do not overlap.
    const adjacent = { ...scheduled, startsAt: scheduled.startsAt.map((date) => new Date(Date.parse(date) + 86400000).toISOString()) };
    const next = (await publish(groups[0]!, adjacent).expect(201)).body;
    const edit = { ...adjacent, question: next.question, startsAt: scheduled.startsAt, slotEndsAt: scheduled.slotEndsAt };
    await api().patch(`/api/v1/polls/${next.id}`).set(auth()).send(edit).expect(409);
    await finish(first.id); await finish(second.id);
    expect((await mark(first.id, studentId, "PRESENT")).status).toBe(200);
    expect((await mark(second.id, studentId, "ABSENT", 0)).status).toBe(200);
    const records = await db.sessionParticipant.findMany({ where: { userId: studentId, pollId: { in: [first.id, second.id] } }, include: { marks: true } });
    expect(records.find((person) => person.pollId === first.id)!.marks[0]!.attendance).toBe("PRESENT");
    expect(records.find((person) => person.pollId === second.id)!.absenceConfirmedAt).not.toBeNull();
  });
  it("empêche deux admins d’écraser un même pointage et protège les opérations administratives", async () => {
    const poll = await create(1);
    await cast(poll);
    await db.poll.update({ where: { id: poll.id }, data: { endsAt: new Date(Date.now() - 120000) } });
    await db.pollOption.updateMany({ where: { pollId: poll.id }, data: { startsAt: new Date(Date.now() - 60000) } });
    const list = await roster(poll.id);
    const row = list.slots[0].students.find(
      (s: { user: { id: string } }) => s.user.id === studentId,
    );
    const entry = {
      userId: studentId,
      optionId: list.slots[0].id,
      status: "PRESENT",
      version: row.version,
      participantVersion: row.participantVersion,
    };
    const results = await Promise.all([
      api()
        .put(`/api/v1/polls/${poll.id}/attendance`)
        .set(auth())
        .send({ entries: [entry] }),
      api()
        .put(`/api/v1/polls/${poll.id}/attendance`)
        .set(auth(otherAdmin))
        .send({ entries: [{ ...entry, status: "ABSENT" }] }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance`)
      .set(auth(student))
      .send({ entries: [entry] })
      .expect(403);
    await api().get("/api/v1/admin/attendance/reports").set(auth(student)).expect(403);
    await api().get("/api/v1/admin/attendance/sessions").set(auth(student)).expect(403);
    await api()
      .put(`/api/v1/polls/${poll.id}/attendance/absence/${studentId}`)
      .set(auth(student))
      .send({ version: 0 })
      .expect(403);
  });
});
