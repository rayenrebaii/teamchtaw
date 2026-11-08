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

describe("Présences obligatoires sans dépendance aux votes", () => {
  let app: INestApplication;
  let db: PrismaService;
  let processor: MandatoryAttendanceService;
  let admin: string, otherAdmin: string, student: string;
  let studentId: string, nonVoterId: string, waitingId: string, groupId: string;
  const password = "Mandatory-Attendance-Test-2026!";
  const api = () => request(app.getHttpServer());
  const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
  const input = (count = 3) => ({
    type: "SESSION",
    mandatoryAttendance: true,
    question: `Séance ${randomUUID()}`,
    singleChoice: false,
    status: "OPEN",
    endsAt: new Date(Date.now() + 1800000).toISOString(),
    options: Array.from({ length: count }, (_, i) => `Créneau ${i + 1}`),
    startsAt: Array.from({ length: count }, (_, i) =>
      new Date(Date.now() + (i + 1) * 3600000).toISOString(),
    ),
    slotEndsAt: Array.from({ length: count }, (_, i) =>
      new Date(Date.now() + (i + 1) * 3600000 + 1800000).toISOString(),
    ),
  });
  async function create(count = 3, targetGroupId = groupId) {
    return (
      await api()
        .post(`/api/v1/groups/${targetGroupId}/polls`)
        .set(auth())
        .send(input(count))
        .expect(201)
    ).body;
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
      { slotEndsAt: valid.slotEndsAt.slice(1) },
      { slotEndsAt: [...valid.startsAt] },
      { startsAt: [valid.endsAt, ...valid.startsAt.slice(1)] },
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
      valid.slotEndsAt,
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
  it("confirme une seule absence lorsque tous les créneaux sont absents et recalcule chaque correction", async () => {
    const poll = await create(2);
    expect((await mark(poll.id, studentId, "ABSENT", 0)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("EN_ATTENTE");
    expect((await mark(poll.id, studentId, "ABSENT", 1)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("ABSENT");
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      1,
    );
    expect((await mark(poll.id, studentId, "ABSENT", 1)).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      1,
    );
    expect(
      await db.sessionAttendanceEdit.count({
        where: { pollId: poll.id, userId: studentId, action: "CONFIRM_ALL_SLOTS_ABSENT" },
      }),
    ).toBe(1);
    expect((await mark(poll.id, studentId, "NON_VERIFIE", 1)).status).toBe(200);
    expect(
      (await roster(poll.id)).participants.find(
        (p: { user: { id: string } }) => p.user.id === studentId,
      ).final,
    ).toBe("EN_ATTENTE");
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(
      0,
    );
    expect((await mark(poll.id, studentId, "PRESENT", 1)).status).toBe(200);
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
  it("pointe un étudiant sans vote, préserve les votes multiples et recalcule après correction", async () => {
    const poll = await create();
    await api()
      .post(`/api/v1/polls/${poll.id}/votes`)
      .set(auth(student))
      .send({ optionIds: poll.options.map((o: { id: string }) => o.id) })
      .expect(201);
    expect((await mark(poll.id, nonVoterId, "PRESENT", 1)).status).toBe(200);
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
    let list = await roster(poll.id);
    expect(
      list.slots[2].students.find((s: { user: { id: string } }) => s.user.id === studentId).final,
    ).toBe("PRESENT");
    expect(await db.pollVote.count({ where: { pollId: poll.id, userId: nonVoterId } })).toBe(0);
    expect(await db.pollVoteOption.count({ where: { pollId: poll.id } })).toBe(3);
    expect((await mark(poll.id, studentId, "NON_VERIFIE", 0)).status).toBe(200);
    list = await roster(poll.id);
    expect(
      list.slots[2].students.find((s: { user: { id: string } }) => s.user.id === studentId).final,
    ).toBe("EN_ATTENTE");
    expect(
      await db.sessionAttendanceEdit.count({ where: { pollId: poll.id, userId: studentId } }),
    ).toBe(2);
  });
  it("ne signale ni ne confirme une absence avant la fin du dernier créneau", async () => {
    const poll = await create();
    expect((await mark(poll.id, studentId, "ABSENT", 0)).status).toBe(200);
    await processor.processDueSessions();
    expect(
      await db.sessionParticipant.count({
        where: { pollId: poll.id, reportOpenedAt: { not: null } },
      }),
    ).toBe(0);
    expect((await confirm(poll.id, studentId)).status).toBe(409);
    expect((await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0).toBe(
      0,
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
  });
  it("détecte les non-votants après la fin, reprend après redémarrage et reste idempotent sans absence automatique", async () => {
    const poll = await create();
    await finish(poll.id);
    await processor.processDueSessions();
    await processor.processDueSessions();
    const all = await db.sessionParticipant.findMany({ where: { pollId: poll.id } });
    expect(all).toHaveLength(2);
    expect(all.every((p) => p.reportOpenedAt && !p.reportResolvedAt && !p.absenceConfirmedAt)).toBe(
      true,
    );
    await db.sessionParticipant.update({
      where: { pollId_userId: { pollId: poll.id, userId: studentId } },
      data: { reportOpenedAt: null },
    });
    await api()
      .get(`/api/v1/admin/attendance/reports?pollId=${poll.id}`)
      .set(auth())
      .expect(200)
      .expect((r) => expect(r.body.total).toBe(2));
    expect((await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0).toBe(
      0,
    );
  });
  it("confirme une seule absence globale, puis la corrige en présence sans vote", async () => {
    const poll = await create();
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
      .expect(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: nonVoterId } })).total).toBe(
      1,
    );
    expect((await confirm(p.id, nonVoterId)).status).toBe(409);
    expect(
      await db.sessionAttendanceEdit.count({ where: { pollId: p.id, action: "CANCEL_SESSION" } }),
    ).toBe(2);
  });
  it("bloque les pointages futurs et annule intégralement un lot qui contient un créneau non commencé", async () => {
    const poll = await create(2);
    const list = await roster(poll.id);
    const entries = list.slots.map((slot: { id: string; students: { user: { id: string }; version: number; participantVersion: number }[] }) => {
      const row = slot.students.find((person) => person.user.id === studentId)!;
      return { userId: studentId, optionId: slot.id, status: "PRESENT", version: row.version, participantVersion: row.participantVersion };
    });
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries }).expect(409);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    await db.pollOption.update({ where: { id: entries[0]!.optionId }, data: { startsAt: new Date(Date.now() - 1000) } });
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries }).expect(409);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    expect((await db.poll.findUniqueOrThrow({ where: { id: poll.id } })).attendanceLockedAt).toBeNull();
    await api().put(`/api/v1/polls/${poll.id}/attendance`).set(auth()).send({ entries: [entries[0]] }).expect(200);
  });
  it("retire un créneau voté puis supprime la séance avec ses pointages et recalcule les absences", async () => {
    const poll = await create(2);
    await api().post(`/api/v1/polls/${poll.id}/votes`).set(auth(student)).send({ optionIds: poll.options.map((option: { id: string }) => option.id) }).expect(201);
    await db.pollVote.create({ data: { userId: nonVoterId, pollId: poll.id, options: { create: { optionId: poll.options[0].id } } } });
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}/options/${randomUUID()}`).set(auth()).expect(404);
    const remaining = await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth()).expect(200);
    expect(remaining.body.options.map((option: { id: string }) => option.id)).toEqual([poll.options[1].id]);
    expect(remaining.body.votes[0].optionIds).toEqual([poll.options[1].id]);
    expect(remaining.body.votes.some((vote: { userId: string }) => vote.userId === nonVoterId)).toBe(false);
    expect((await db.pollOption.findUniqueOrThrow({ where: { id: poll.options[1].id } })).position).toBe(0);
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[1].id}`).set(auth()).expect(409);
    await finish(poll.id);
    const before = (await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0;
    expect((await mark(poll.id, studentId, "ABSENT")).status).toBe(200);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before + 1);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth()).expect(204);
    expect(await db.poll.findUnique({ where: { id: poll.id } })).toBeNull();
    expect(await db.sessionParticipant.count({ where: { pollId: poll.id } })).toBe(0);
    expect(await db.sessionMark.count({ where: { pollId: poll.id } })).toBe(0);
    expect(await db.message.count({ where: { pollId: poll.id } })).toBe(0);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before);
    await api().get(`/api/v1/polls/${poll.id}`).set(auth()).expect(404);
  });
  it("recalcule le résultat et les absences lorsqu’un créneau déjà pointé est retiré", async () => {
    const poll = await create(2);
    await finish(poll.id);
    const before = (await db.absenceState.findUnique({ where: { userId: studentId } }))?.total ?? 0;
    expect((await mark(poll.id, studentId, "PRESENT", 0)).status).toBe(200);
    expect((await mark(poll.id, studentId, "ABSENT", 1)).status).toBe(200);
    await api().delete(`/api/v1/polls/${poll.id}/options/${poll.options[0].id}`).set(auth()).expect(200);
    expect(await db.sessionMark.count({ where: { optionId: poll.options[0].id } })).toBe(0);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before + 1);
    await api().delete(`/api/v1/polls/${poll.id}`).set(auth()).expect(204);
    expect((await db.absenceState.findUniqueOrThrow({ where: { userId: studentId } })).total).toBe(before);
  });
  it("empêche deux admins d’écraser un même pointage et protège les opérations administratives", async () => {
    const poll = await create(1);
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
