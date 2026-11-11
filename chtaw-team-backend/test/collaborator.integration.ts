import "reflect-metadata";
import "dotenv/config";
import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { PrismaService } from "../src/prisma/prisma.module";
import { AccountMailer } from "../src/auth/account-links.service";
import { configureApp } from "../src/bootstrap";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";

describe("Collaborateurs : parcours et isolation transactionnelle", () => {
  let app: INestApplication, db: PrismaService;
  let admin: string, student: string, collaboratorA: string, collaboratorB: string;
  let adminId: string, studentId: string, aId: string, bId: string, groupId: string, forbiddenGroup: string;
  let aPoll: { id: string; options: { id: string }[] }, bPoll: typeof aPoll;
  const password = "Collaborator-Local-Test-2026!";
  const suffix = randomUUID();
  const deliveries = new Map<string, string>();
  const mail = { send: jest.fn(async (email: string, token: string) => { deliveries.set(email, token); return randomUUID(); }) };
  let limiter = new ThrottlerStorageService();
  const api = () => request(app.getHttpServer());
  const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
  const emailA = `collab-a-${suffix}@test.invalid`, emailB = `collab-b-${suffix}@test.invalid`;
  const input = () => ({ type: "SESSION", mandatoryAttendance: true, question: `Séance ${randomUUID()}`, singleChoice: false,
    status: "OPEN", endsAt: new Date(Date.now() + 600000).toISOString(), options: ["Matin", "Soir"],
    startsAt: [1, 2].map((offset) => new Date(Date.now() + offset * 3600000).toISOString()),
    slotEndsAt: [1, 2].map((offset) => new Date(Date.now() + offset * 3600000 + 1800000).toISOString()) });
  const login = async (email: string, pass = password) => (await api().post("/api/v1/auth/login").send({ email, password: pass }).expect(200)).body.accessToken as string;
  const redeem = (token: string, pass = password) => api().post("/api/v1/auth/account-links/redeem").send({ token, password: pass });
  let fixtureSchedule = 0;
  const create = async (token: string) => {
    const scheduled = input();
    const offset = ++fixtureSchedule * 86400000;
    scheduled.startsAt = scheduled.startsAt.map((value) => new Date(Date.parse(value) + offset).toISOString());
    scheduled.slotEndsAt = scheduled.slotEndsAt.map((value) => new Date(Date.parse(value) + offset).toISOString());
    return (await api().post(`/api/v1/groups/${groupId}/polls`).set(auth(token)).send(scheduled).expect(201)).body as typeof aPoll;
  };
  const finish = async (id: string) => {
    await db.poll.update({ where: { id }, data: { endsAt: new Date(Date.now() - 7200000) } });
    await db.pollOption.updateMany({ where: { pollId: id }, data: { startsAt: new Date(Date.now() - 3600000), endsAt: new Date(Date.now() - 1800000) } });
  };
  const absent = async (token: string, id: string) => {
    await finish(id);
    const person = await db.sessionParticipant.findUniqueOrThrow({ where: { pollId_userId: { pollId: id, userId: studentId } } });
    return api().put(`/api/v1/polls/${id}/attendance/absence/${studentId}`).set(auth(token)).send({ version: person.version });
  };
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url || !/^\/chtaw_test_[a-f0-9]{12}$/.test(new URL(url).pathname) || process.env.ISOLATED_TEST_DATABASE !== new URL(url).pathname.slice(1)) throw Error("An isolated test database is required.");
    process.env.DATABASE_URL = url; process.env.AUTH_PROVIDER = "legacy"; process.env.NODE_ENV = "test";
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(AccountMailer).useValue(mail)
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false })); await app.init();
    db = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    const a = await db.user.create({ data: { email: `admin-${suffix}@test.invalid`, firstName: "Admin", lastName: "Test", role: "ADMIN", status: "APPROVED", passwordHash } });
    const s = await db.user.create({ data: { email: `student-${suffix}@test.invalid`, firstName: "Student", lastName: "Test", role: "USER", status: "APPROVED", passwordHash } });
    adminId = a.id; studentId = s.id; admin = await login(a.email); student = await login(s.email);
    const group = await db.group.create({ data: { name: `Collaborator ${suffix}`, members: { create: [{ userId: a.id }, { userId: s.id }] } } }); groupId = group.id;
    forbiddenGroup = (await db.group.create({ data: { name: `Forbidden ${suffix}`, members: { create: [{ userId: a.id }] } } })).id;
  });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });
  // Each business scenario has its own request budget; production throttles remain enabled.
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });

  it("réserve la création à l’admin et garde le compte en attente d’invitation", async () => {
    for (const email of [emailA, emailB]) {
      const response = await api().post("/api/v1/admin/collaborators").set(auth()).send({ email, firstName: "Collaborator", lastName: "Test" }).expect(201);
      expect(response.body.user.role).toBe("COLLABORATOR"); expect(response.body.user.status).toBe("PENDING");
      expect(response.body.invitation.sent).toBe(true); expect(response.body).not.toHaveProperty("token");
      expect(response.body.user).not.toHaveProperty("passwordHash");
      if (email === emailA) aId = response.body.user.id; else bId = response.body.user.id;
    }
    expect(await db.groupMember.count({ where: { userId: { in: [aId, bId] } } })).toBe(0);
  });
  it("refuse la création par un étudiant", async () => {
    await api().post("/api/v1/admin/collaborators").set(auth(student)).send({ email: "other@test.invalid", firstName: "Test", lastName: "Test" }).expect(403);
  });
  it("refuse les doublons d’e-mail et l’élévation publique de rôle", async () => {
    await api().post("/api/v1/admin/collaborators").set(auth()).send({ email: emailA, firstName: "Test", lastName: "Test" }).expect(409);
    await api().post("/api/v1/auth/register").send({ email: `public-${suffix}@test.invalid`, firstName: "Test", lastName: "Test", password, role: "COLLABORATOR" }).expect(400);
  });
  it("n’enregistre que le hachage d’un lien et refuse un lien falsifié", async () => {
    const token = deliveries.get(emailA)!;
    const links = await db.accountLink.findMany({ where: { userId: aId } });
    expect(links[0]!.tokenHash).not.toEqual(token); expect(links[0]!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    await redeem("a".repeat(43)).expect(400);
  });
  it("active une seule fois les invitations, puis permet la connexion", async () => {
    const token = deliveries.get(emailA)!;
    await redeem(token).expect(201); await redeem(token).expect(400);
    await redeem(deliveries.get(emailB)!).expect(201);
    collaboratorA = await login(emailA); collaboratorB = await login(emailB);
    expect((await db.user.findUniqueOrThrow({ where: { id: aId } })).emailVerified).toBe(true);
  });
  it("refuse la création et la gestion administrative par un collaborateur", async () => {
    for (const path of ["/admin/collaborators", "/groups"]) await api().post(`/api/v1${path}`).set(auth(collaboratorA)).send({ email: "forbidden@test.invalid", firstName: "Test", lastName: "Test", name: "Forbidden" }).expect(403);
    await api().get("/api/v1/users").set(auth(collaboratorA)).expect(403);
    await api().patch(`/api/v1/approvals/${studentId}`).set(auth(collaboratorA)).send({ status: "REJECTED" }).expect(403);
  });
  it("refuse les groupes sans affectation et les sondages ordinaires", async () => {
    await api().post(`/api/v1/groups/${forbiddenGroup}/polls`).set(auth(collaboratorA)).send(input()).expect(403);
    for (const id of [aId, bId]) await api().put(`/api/v1/admin/collaborators/${id}/groups/${groupId}`).set(auth()).send({ granted: true }).expect(200);
    await api().post(`/api/v1/groups/${groupId}/polls`).set(auth(collaboratorA)).send({ question: "Ordinary", options: ["Yes", "No"], singleChoice: true, type: "ORDINARY" }).expect(403);
  });
  it("crée des séances avec plusieurs créneaux dans le groupe autorisé", async () => {
    aPoll = await create(collaboratorA); bPoll = await create(collaboratorB);
    expect(aPoll.options).toHaveLength(2);
    expect(await db.sessionParticipant.count({ where: { pollId: aPoll.id, userId: studentId } })).toBe(1);
  });
  it("isole les listes de gestion et calendriers côté backend", async () => {
    for (const [token, own, other] of [[collaboratorA, aPoll.id, bPoll.id], [collaboratorB, bPoll.id, aPoll.id]]) {
      const polls = (await api().get("/api/v1/polls?limit=100").set(auth(token)).expect(200)).body.items;
      expect(polls.some((poll: { id: string }) => poll.id === own)).toBe(true); expect(polls.some((poll: { id: string }) => poll.id === other)).toBe(false);
      const sessions = (await api().get("/api/v1/admin/attendance/sessions?limit=100").set(auth(token)).expect(200)).body.items;
      expect(sessions.every((poll: { id: string }) => poll.id !== other)).toBe(true);
    }
  });
  it("laisse les étudiants du groupe consulter les séances et voter plusieurs créneaux", async () => {
    await api().get(`/api/v1/polls/${aPoll.id}`).set(auth(student)).expect(200);
    await api().post(`/api/v1/polls/${aPoll.id}/votes`).set(auth(student)).send({ optionIds: aPoll.options.map((option) => option.id) }).expect(201);
    await api().put(`/api/v1/polls/${aPoll.id}/votes`).set(auth(student)).send({ optionIds: [aPoll.options[0]!.id] }).expect(200);
  });
  it("interdit modification, annulation, pointage et suppression de la séance d’autrui", async () => {
    await api().get(`/api/v1/polls/${bPoll.id}`).set(auth(collaboratorA)).expect(403);
    await api().get(`/api/v1/polls/${bPoll.id}/attendance`).set(auth(collaboratorA)).expect(403);
    await api().put(`/api/v1/polls/${bPoll.id}/attendance`).set(auth(collaboratorA)).send({ entries: [{ userId: studentId, optionId: bPoll.options[0]!.id, status: "PRESENT", version: 0, participantVersion: 0 }] }).expect(403);
    await api().patch(`/api/v1/polls/${bPoll.id}`).set(auth(collaboratorA)).send(input()).expect(403);
    await api().delete(`/api/v1/polls/${bPoll.id}`).set(auth(collaboratorA)).expect(403);
  });
  it("reserves message deletion to admins, including the author's own messages", async () => {
    for (const token of [admin, student, collaboratorA]) {
      const sent = await api().post(`/api/v1/groups/${groupId}/messages`).set(auth(token)).send({ text: "Deletion fixture" }).expect(201);
      const path = `/api/v1/groups/${groupId}/messages/${sent.body.id}`;
      await api().delete(path).set(auth(student)).expect(403);
      await api().delete(path).set(auth(collaboratorA)).expect(403);
      await api().delete(`/api/v1/groups/${forbiddenGroup}/messages/${sent.body.id}`).set(auth()).expect(404);
      expect(await db.message.count({ where: { id: sent.body.id } })).toBe(1);
      await api().delete(path).set(auth()).expect(200);
      expect(await db.message.count({ where: { id: sent.body.id } })).toBe(0);
    }
  });
  it("allows admins to delete anyone's polls and collaborators only their own", async () => {
    for (const [creator, remover] of [[admin, admin], [collaboratorA, admin], [collaboratorA, collaboratorA]]) {
      const scheduled = input();
      scheduled.startsAt = [3, 4].map((hours) => new Date(Date.now() + hours * 3600000).toISOString());
      scheduled.slotEndsAt = [3, 4].map((hours) => new Date(Date.now() + (hours + 0.5) * 3600000).toISOString());
      const poll = (await api().post(`/api/v1/groups/${groupId}/polls`).set(auth(creator!)).send(scheduled).expect(201)).body as typeof aPoll;
      await api().post(`/api/v1/polls/${poll.id}/votes`).set(auth(student)).send({ optionIds: [poll.options[0]!.id] }).expect(201);
      await api().delete(`/api/v1/polls/${poll.id}`).set(auth(student)).expect(403);
      await api().delete(`/api/v1/polls/${poll.id}`).set(auth(collaboratorB)).expect(403);
      if (creator === admin) await api().delete(`/api/v1/polls/${poll.id}`).set(auth(collaboratorA)).expect(403);
      await api().delete(`/api/v1/polls/${poll.id}`).set(auth(remover!)).expect(204);
      expect(await db.poll.count({ where: { id: poll.id } })).toBe(0);
      expect(await db.message.count({ where: { pollId: poll.id } })).toBe(0);
      expect(await db.pollVote.count({ where: { pollId: poll.id } })).toBe(0);
      expect(await db.sessionParticipant.count({ where: { pollId: poll.id } })).toBe(0);
    }
    const ordinary = (await api().post(`/api/v1/groups/${groupId}/polls`).set(auth()).send({ question: "Ordinary deletion", singleChoice: true, options: ["Yes", "No"] }).expect(201)).body;
    await api().delete(`/api/v1/polls/${ordinary.id}`).set(auth(collaboratorA)).expect(403);
    await api().delete(`/api/v1/polls/${ordinary.id}`).set(auth()).expect(204);
    expect(await db.poll.count({ where: { id: ordinary.id } })).toBe(0);
  });
  it("prevents another collaborator from reserving the group's slots until the first session is removed", async () => {
    const scheduled = input();
    scheduled.startsAt = scheduled.startsAt.map((value) => new Date(Date.parse(value) + 180 * 86400000).toISOString());
    scheduled.slotEndsAt = scheduled.slotEndsAt.map((value) => new Date(Date.parse(value) + 180 * 86400000).toISOString());
    const publish = (token: string) => api().post(`/api/v1/groups/${groupId}/polls`).set(auth(token)).send(scheduled);
    const first = (await publish(collaboratorA).expect(201)).body;
    await publish(collaboratorB).expect(409);
    await api().delete(`/api/v1/polls/${first.id}`).set(auth(collaboratorB)).expect(403);
    await publish(collaboratorB).expect(409);
    await api().delete(`/api/v1/polls/${first.id}`).set(auth(collaboratorA)).expect(204);
    const replacement = (await publish(collaboratorB).expect(201)).body;
    await api().delete(`/api/v1/polls/${replacement.id}`).set(auth(collaboratorB)).expect(204);
  });
  it("autorise le pointage des non-votants et préserve les votes", async () => {
    await absent(collaboratorA, aPoll.id).then((response) => expect(response.status).toBe(200));
    expect(await db.pollVote.count({ where: { pollId: aPoll.id, userId: studentId } })).toBe(1);
    await absent(collaboratorB, bPoll.id).then((response) => expect(response.status).toBe(200));
    expect(await db.pollVote.count({ where: { pollId: bPoll.id } })).toBe(0);
  });
  it("isole les compteurs et déclenche une seule alerte à trois absences chez A", async () => {
    const extra = await Promise.all([create(collaboratorA), create(collaboratorA)]);
    for (const poll of extra) await absent(collaboratorA, poll.id).then((response) => expect(response.status).toBe(200));
    for (let index = 0; index < 2; index++) { const poll = await create(admin); await absent(admin, poll.id).then((response) => expect(response.status).toBe(200)); }
    const states = await db.organizerAbsenceState.findMany({ where: { userId: studentId } });
    expect(states.find((state) => state.organizerId === aId)?.total).toBe(3);
    expect(states.find((state) => state.organizerId === bId)?.total).toBe(1);
    expect(states.find((state) => state.organizerId === adminId)?.total).toBe(2);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: studentId } })).toBe(1);
    const overview = (await api().get("/api/v1/admin/attendance").set(auth(collaboratorB)).expect(200)).body;
    expect(overview.items[0].totalAbsences).toBe(1);
  });
  it("refuse les signalements d’autrui et permet leur supervision par l’admin", async () => {
    const alert = await db.organizerAbsenceAlert.findFirstOrThrow({ where: { userId: studentId, organizerId: aId } });
    await api().get(`/api/v1/organizer/absence-alerts/${alert.id}`).set(auth(collaboratorB)).expect(404);
    await api().put(`/api/v1/organizer/absence-alerts/${alert.id}/confirm`).set(auth(collaboratorB)).expect(404);
    await api().put(`/api/v1/organizer/absence-alerts/${alert.id}/confirm`).set(auth(collaboratorA)).expect(200);
    const detail = (await api().get(`/api/v1/organizer/absence-alerts/${alert.id}`).set(auth()).expect(200)).body;
    expect(detail.sessions).toHaveLength(3); expect(detail.total).toBe(3);
    expect((await api().get("/api/v1/admin/absence-alerts").set(auth()).expect(200)).body.some((row: { id: string }) => row.id === alert.id)).toBe(true);
  });
  it("corrige une absence en présence, historise et résout l’alerte sous le seuil", async () => {
    const roster = (await api().get(`/api/v1/polls/${aPoll.id}/attendance`).set(auth(collaboratorA)).expect(200)).body;
    const row = roster.slots[0].students.find((item: { user: { id: string } }) => item.user.id === studentId);
    await api().put(`/api/v1/polls/${aPoll.id}/attendance`).set(auth(collaboratorA)).send({ entries: [{ userId: studentId, optionId: aPoll.options[0]!.id, status: "PRESENT", version: row.version, participantVersion: row.participantVersion }] }).expect(200);
    expect((await db.organizerAbsenceState.findUniqueOrThrow({ where: { userId_organizerId: { userId: studentId, organizerId: aId } } })).total).toBe(2);
    expect((await db.organizerAbsenceAlert.findFirstOrThrow({ where: { userId: studentId, organizerId: aId } })).resolvedAt).not.toBeNull();
    expect(await db.sessionAttendanceEdit.count({ where: { pollId: aPoll.id, userId: studentId, action: "MARK" } })).toBe(1);
  });
  it("évite les doublons lors de confirmations concurrentes et protège les versions", async () => {
    const poll = await create(collaboratorA); await finish(poll.id);
    const responses = await Promise.all([absent(collaboratorA, poll.id), absent(collaboratorA, poll.id)]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await db.organizerAbsenceAlert.count({ where: { userId: studentId, organizerId: aId, resolvedAt: null } })).toBe(1);
  });
  it("interdit suspension et suppression aux collaborateurs, autorise la suspension admin", async () => {
    await api().patch(`/api/v1/admin/students/${studentId}/disabled`).set(auth(collaboratorA)).send({ disabled: true }).expect(403);
    await api().delete(`/api/v1/users/${studentId}`).set(auth(collaboratorA)).expect(403);
    await api().patch(`/api/v1/admin/students/${studentId}/disabled`).set(auth()).send({ disabled: true }).expect(200);
    await api().get("/api/v1/groups").set(auth(student)).expect(401);
    await api().patch(`/api/v1/admin/students/${studentId}/disabled`).set(auth()).send({ disabled: false }).expect(200);
    expect(await db.user.count({ where: { id: studentId } })).toBe(1);
  });
  it("désactive un collaborateur, révoque ses sessions et permet sa réactivation", async () => {
    await api().patch(`/api/v1/admin/collaborators/${aId}/disabled`).set(auth()).send({ disabled: true }).expect(200);
    await api().get("/api/v1/groups").set(auth(collaboratorA)).expect(401);
    await api().post("/api/v1/auth/login").send({ email: emailA, password }).expect(401);
    await api().patch(`/api/v1/admin/collaborators/${aId}/disabled`).set(auth()).send({ disabled: false }).expect(200);
    collaboratorA = await login(emailA);
  });
  it("renvoie une réponse publique identique pour une adresse connue ou inconnue", async () => {
    const known = await api().post("/api/v1/auth/account-links/forgot").send({ email: emailA }).expect(201);
    const unknown = await api().post("/api/v1/auth/account-links/forgot").send({ email: `missing-${suffix}@test.invalid` }).expect(201);
    expect(known.body).toEqual(unknown.body);
  });
  it("réinitialise une fois le mot de passe et invalide toutes les sessions", async () => {
    const token = deliveries.get(emailA)!;
    const next = password + "New";
    await redeem(token, next).expect(201); await redeem(token, next).expect(400);
    await api().get("/api/v1/groups").set(auth(collaboratorA)).expect(401);
    await login(emailA, next);
    await api().post("/api/v1/auth/login").send({ email: emailA, password }).expect(401);
  });
  it("refuse les invitations expirées et permet un nouvel envoi contrôlé", async () => {
    const email = `expired-${suffix}@test.invalid`;
    const created = (await api().post("/api/v1/admin/collaborators").set(auth()).send({ email, firstName: "Expired", lastName: "Test" }).expect(201)).body.user;
    const old = deliveries.get(email)!;
    await db.accountLink.updateMany({ where: { userId: created.id }, data: { expiresAt: new Date(0), createdAt: new Date(0) } });
    await redeem(old).expect(400);
    await api().post(`/api/v1/admin/collaborators/${created.id}/invitation`).set(auth()).expect(201);
    await redeem(old).expect(400); await redeem(deliveries.get(email)!).expect(201);
  });
  it("supprime un collaborateur invité et invalide son lien sans toucher aux autres comptes", async () => {
    const email = `remove-invited-${suffix}@test.invalid`;
    const created = (await api().post("/api/v1/admin/collaborators").set(auth()).send({ email, firstName: "Pending", lastName: "Deletion" }).expect(201)).body.user;
    const invitation = deliveries.get(email)!;
    student = await login((await db.user.findUniqueOrThrow({ where: { id: studentId }, select: { email: true } })).email);
    await api().delete(`/api/v1/users/${created.id}`).set(auth(student)).expect(403);
    await api().delete(`/api/v1/users/${created.id}`).set(auth(collaboratorB)).expect(403);
    expect(await db.user.count({ where: { id: created.id } })).toBe(1);
    await api().delete(`/api/v1/users/${created.id}`).set(auth()).expect(204);
    expect(await db.user.count({ where: { id: created.id } })).toBe(0);
    expect(await db.accountLink.count({ where: { userId: created.id } })).toBe(0);
    await redeem(invitation).expect(400);
    expect(await db.user.count({ where: { id: { in: [adminId, studentId, aId, bId] } } })).toBe(4);
  });
  it("protège les administrateurs et les étudiants en attente contre la suppression", async () => {
    await api().delete(`/api/v1/users/${adminId}`).set(auth()).expect(403);
    const pending = await db.user.create({ data: { email: `pending-delete-${suffix}@test.invalid`, firstName: "Pending", lastName: "Student", passwordHash: await argon2.hash(password) } });
    await api().delete(`/api/v1/users/${pending.id}`).set(auth()).expect(409);
    expect(await db.user.count({ where: { id: pending.id } })).toBe(1);
  });
  it("limite les demandes publiques de réinitialisation à cinq par minute", async () => {
    for (let index = 0; index < 5; index++) await api().post("/api/v1/auth/account-links/forgot").send({ email: "missing@test.invalid" }).expect(201);
    await api().post("/api/v1/auth/account-links/forgot").send({ email: "missing@test.invalid" }).expect(429);
  });
});
