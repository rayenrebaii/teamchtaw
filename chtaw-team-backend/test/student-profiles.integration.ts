import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import request from "supertest";
import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import sharp from "sharp";
import { Workbook, ValueType } from "exceljs";
import { PrismaService } from "../src/prisma/prisma.module";
import { configureApp } from "../src/bootstrap";
import { MEDIA_STORAGE, PostgresMediaStorage } from "../src/uploads/storage.module";
import { ProfilePhotosService } from "../src/users/profile-photos.module";

describe("Student schools, suggestions and durable private profile photos", () => {
  let app: INestApplication, db: PrismaService, image: Buffer;
  let limiter = new ThrottlerStorageService();
  const accounts: Record<string, { id: string; token: string }> = {};
  let school: { id: string; name: string }, manual: { id: string; name: string };
  const password = "Disposable-Student-Profile-2026!";
  const api = () => request(app.getHttpServer());
  const auth = (role = "ADMIN") => ({ Authorization: `Bearer ${accounts[role]!.token}` });
  const photoPath = (id: string, photoId: string) => `/api/v1/profile-photos/${id}/${photoId}`;
  const register = (choice: object) => api().post("/api/v1/auth/register").send({ email: `school-${randomUUID()}@test.invalid`, firstName: "Nadia", lastName: "Fixture", password, phone: "+21620123456", ...choice });
  beforeAll(async () => {
    if (process.env.CHTAW_ISOLATED_TESTS !== "1") throw Error("Isolated runner required.");
    const { AppModule } = await import("../src/app.module");
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ThrottlerStorage).useValue({ increment: (...args: Parameters<ThrottlerStorageService["increment"]>) => limiter.increment(...args) })
      .overrideProvider(MEDIA_STORAGE).useFactory({ factory: (db: PrismaService) => new PostgresMediaStorage(db), inject: [PrismaService] }).compile();
    app = configureApp(module.createNestApplication({ bodyParser: false, logger: false }));
    await app.init(); db = app.get(PrismaService);
    const passwordHash = await argon2.hash(password);
    for (const role of ["ADMIN", "USER", "COLLABORATOR", "PENDING"] as const) {
      const user = await db.user.create({ data: { email: `profile-${randomUUID()}@test.invalid`, firstName: "Profile", lastName: role, passwordHash,
        role: role === "PENDING" ? "USER" : role, status: role === "PENDING" ? "PENDING" : "APPROVED", ...(role === "COLLABORATOR" ? { activatedAt: new Date() } : {}) } });
      const response = await api().post("/api/v1/auth/login").send({ email: user.email, password }).expect(200);
      accounts[role] = { id: user.id, token: response.body.accessToken as string };
    }
    school = await db.establishment.create({ data: { name: `Lycée Pilote ${randomUUID()}` } });
    manual = await db.establishment.create({ data: { name: `Lycée Manuel ${randomUUID()}` } });
    image = await sharp({ create: { width: 20, height: 12, channels: 3, background: "#a878d1" } }).jpeg().withMetadata().toBuffer();
  });
  beforeEach(() => { limiter.onApplicationShutdown(); limiter = new ThrottlerStorageService(); });
  afterAll(async () => { limiter.onApplicationShutdown(); await app?.close(); });

  it("exposes only official ids and names without a session", async () => {
    const response = await api().get("/api/v1/establishments").expect(200);
    expect(response.body).toContainEqual(school);
    for (const row of response.body) expect(Object.keys(row).sort()).toEqual(["id", "name"]);
    await api().get("/api/v1/admin/establishment-suggestions").expect(401);
  });
  it("registers with an official school, without a photo, preserving account approval", async () => {
    const response = await register({ establishmentId: school.id }).expect(201);
    expect(response.body).toMatchObject({ role: "USER", status: "PENDING", phone: "+21620123456", profilePhotoId: null, establishment: school, establishmentSuggestion: null });
    expect(response.body.passwordHash).toBeUndefined();
  });
  it.each([null, "", "2012345", "+33123456789", 20123456])("rejects invalid required registration phones %p", async phone => {
    await register({ establishmentId: school.id, phone }).expect(400);
  });
  it("normalizes a national phone and persists it on the account", async () => {
    const response = await register({ establishmentId: school.id, phone: "20 123 456" }).expect(201);
    expect(response.body.phone).toBe("+21620123456");
    expect((await db.user.findUniqueOrThrow({ where: { id: response.body.id } })).phone).toBe("+21620123456");
  });
  it.each([{}, { establishmentId: randomUUID() }, { establishmentId: null }, { proposedEstablishmentName: "   " }, { proposedEstablishmentName: null }, { proposedEstablishmentName: "a".repeat(121) }, { proposedEstablishmentName: 12 }])("rejects an invalid school choice %p", async choice => {
    await register(choice).expect(400);
  });
  it("rejects both official and proposed names, including an empty second value", async () => {
    await register({ establishmentId: school.id, proposedEstablishmentName: "Another" }).expect(400);
    await register({ establishmentId: school.id, proposedEstablishmentName: "" }).expect(400);
  });
  it("groups equivalent pending suggestions; accepts once concurrently and preserves manual assignments", async () => {
    const label = `Lycée proposé ${randomUUID()}`;
    const created = await Promise.all([label, ` ${label.toUpperCase().replaceAll(" ", "   ")} `].map(proposedEstablishmentName => register({ proposedEstablishmentName })));
    expect(created.map(row => row.status)).toEqual([201, 201]);
    const first = created[0]!.body, second = created[1]!.body;
    const id = first.establishmentSuggestion.id as string;
    expect(second.establishmentSuggestion.id).toBe(id);
    expect(await db.establishment.count({ where: { name: { equals: label, mode: "insensitive" } } })).toBe(0);
    await api().patch(`/api/v1/admin/students/${first.id}/establishment`).set(auth()).send({ establishmentId: manual.id }).expect(200);
    const reviews = await Promise.all([1, 2].map(() => api().patch(`/api/v1/admin/establishment-suggestions/${id}`).set(auth()).send({ status: "APPROVED" })));
    expect(reviews.map(row => row.status).sort()).toEqual([200, 409]);
    const official = await db.establishment.findFirstOrThrow({ where: { name: { equals: label, mode: "insensitive" } } });
    expect((await db.user.findUniqueOrThrow({ where: { id: first.id } })).establishmentId).toBe(manual.id);
    expect(await db.user.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({ establishmentId: official.id, status: "PENDING" });
    const listed = await api().get("/api/v1/admin/establishment-suggestions").set(auth()).expect(200);
    expect(listed.body.find((row: { id: string }) => row.id === id).students).toHaveLength(2);
    const publicList = await api().get("/api/v1/establishments").expect(200);
    expect(publicList.body).toContainEqual(official);
  });
  it("rejects a proposal without rejecting its students and permits a later manual assignment", async () => {
    const name = `École refusée ${randomUUID()}`;
    const response = await register({ proposedEstablishmentName: name }).expect(201);
    const user = response.body;
    await api().patch(`/api/v1/admin/establishment-suggestions/${user.establishmentSuggestion.id}`).set(auth()).send({ status: "REJECTED" }).expect(200);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id }, include: { establishmentSuggestion: true } })).toMatchObject({ status: "PENDING", establishmentId: null, establishmentSuggestion: { name, status: "REJECTED" } });
    expect(await db.establishment.count({ where: { name } })).toBe(0);
    await api().patch(`/api/v1/admin/students/${user.id}/establishment`).set(auth()).send({ establishmentId: school.id }).expect(200);
  });
  it("reuses an existing official school with equivalent case and whitespace on acceptance", async () => {
    const count = await db.establishment.count();
    const response = await register({ proposedEstablishmentName: school.name.toUpperCase().replaceAll(" ", "  ") }).expect(201);
    await api().patch(`/api/v1/admin/establishment-suggestions/${response.body.establishmentSuggestion.id}`).set(auth()).send({ status: "APPROVED" }).expect(200);
    expect(await db.establishment.count()).toBe(count);
    expect((await db.user.findUniqueOrThrow({ where: { id: response.body.id } })).establishmentId).toBe(school.id);
  });
  it.each(["USER", "COLLABORATOR", "PENDING"])("denies school administration for %s", async role => {
    await api().get("/api/v1/admin/establishment-suggestions").set(auth(role)).expect(403);
    await api().patch(`/api/v1/admin/establishment-suggestions/${randomUUID()}`).set(auth(role)).send({ status: "APPROVED" }).expect(403);
    await api().patch(`/api/v1/admin/students/${accounts.USER!.id}/establishment`).set(auth(role)).send({ establishmentId: school.id }).expect(403);
  });
  it("refuses school assignments to admins or collaborators, and deletion of an assigned school", async () => {
    for (const role of ["ADMIN", "COLLABORATOR"]) await api().patch(`/api/v1/admin/students/${accounts[role]!.id}/establishment`).set(auth()).send({ establishmentId: school.id }).expect(400);
    const before = await db.user.count();
    await api().delete(`/api/v1/admin/establishments/${school.id}`).set(auth()).expect(409);
    expect(await db.user.count()).toBe(before);
  });
  it.each(["ADMIN", "USER", "COLLABORATOR", "PENDING"])("adds, replaces and removes its own durable photo for %s", async role => {
    const id = accounts[role]!.id;
    const saved = await api().post("/api/v1/users/me/photo").set(auth(role)).attach("file", image, { filename: "profile.jpg", contentType: "image/jpeg" }).expect(201);
    const firstId = saved.body.profilePhotoId as string;
    const read = await api().get(photoPath(id, firstId)).set(auth(role)).expect(200);
    expect(read.headers["cache-control"]).toBe("private, no-store");
    const metadata = await sharp(read.body as Buffer).metadata();
    expect(metadata.format).toBe("webp"); expect(metadata.exif).toBeUndefined();
    const again = await api().post("/api/v1/users/me/photo").set(auth(role)).attach("file", image, "next.jpg").expect(201);
    expect(again.body.profilePhotoId).not.toBe(firstId);
    expect(await db.storedMedia.findUnique({ where: { key: `${firstId}.webp` } })).toBeNull();
    await api().get(photoPath(id, firstId)).set(auth(role)).expect(404);
    const deleted = await api().delete("/api/v1/users/me/photo").set(auth(role)).expect(200);
    expect(deleted.body.profilePhotoId).toBeNull();
    expect(await db.storedMedia.findUnique({ where: { key: `${again.body.profilePhotoId}.webp` } })).toBeNull();
  });
  it("rejects invalid, missing and oversized files while preserving the current photo", async () => {
    const saved = await api().post("/api/v1/users/me/photo").set(auth()).attach("file", image, "valid.jpg").expect(201);
    await api().post("/api/v1/users/me/photo").set(auth()).expect(400);
    await api().post("/api/v1/users/me/photo").set(auth()).attach("file", Buffer.from("<svg><script>alert(1)</script></svg>"), { filename: "bad.svg", contentType: "image/svg+xml" }).expect(400);
    await api().post("/api/v1/users/me/photo").set(auth()).attach("file", Buffer.from("corrupt"), "corrupt.jpg").expect(400);
    await api().post("/api/v1/users/me/photo").set(auth()).attach("file", Buffer.alloc(5 * 1024 * 1024 + 1), "huge.jpg").expect(413);
    expect((await db.user.findUniqueOrThrow({ where: { id: accounts.ADMIN!.id } })).profilePhotoId).toBe(saved.body.profilePhotoId);
  });
  it("keeps photos private: anonymous/outsider reads fail; shared-group and admin reads succeed", async () => {
    const saved = await api().post("/api/v1/users/me/photo").set(auth("COLLABORATOR")).attach("file", image, "private.jpg").expect(201);
    const path = photoPath(accounts.COLLABORATOR!.id, saved.body.profilePhotoId);
    await api().get(path).expect(401);
    await api().get(path).set(auth("USER")).expect(404);
    await api().get(path).set(auth("PENDING")).expect(403);
    await api().get(path).set(auth()).expect(200);
    await db.group.create({ data: { name: "Photo privacy fixture", members: { create: [accounts.USER!.id, accounts.COLLABORATOR!.id].map(userId => ({ userId })) } } });
    await api().get(path).set(auth("USER")).expect(200);
  });
  it("retains a durable cleanup job on storage failure and retries without deleting the new photo", async () => {
    const first = await api().post("/api/v1/users/me/photo").set(auth()).attach("file", image, "first.jpg").expect(201);
    const storage = app.get<PostgresMediaStorage>(MEDIA_STORAGE);
    const fail = jest.spyOn(storage, "remove").mockRejectedValueOnce(new Error("Temporary storage failure"));
    const second = await api().post("/api/v1/users/me/photo").set(auth()).attach("file", image, "second.jpg").expect(201);
    fail.mockRestore();
    const key = `${first.body.profilePhotoId}.webp`;
    expect(await db.profilePhotoCleanup.findUnique({ where: { storageKey: key } })).not.toBeNull();
    await app.get(ProfilePhotosService).cleanup([key]);
    expect(await db.storedMedia.findUnique({ where: { key } })).toBeNull();
    expect(await db.storedMedia.findUnique({ where: { key: `${second.body.profilePhotoId}.webp` } })).not.toBeNull();
  });
  it("keeps pre-existing accounts without an invented school or photo", async () => {
    const old = await db.user.findUniqueOrThrow({ where: { id: accounts.PENDING!.id } });
    expect(old).toMatchObject({ firstName: "Profile", lastName: "PENDING", establishmentId: null, establishmentSuggestionId: null, profilePhotoId: null });
  });
  it("exports every student beyond one page, with private text cells and all groups, for admins only", async () => {
    const prefix = randomUUID();
    await db.user.createMany({ data: Array.from({ length: 105 }, (_, index) => ({
      email: `export-${prefix}-${index}@test.invalid`, firstName: "Élève", lastName: index === 0 ? "=SUM(1,1)" : `Export ${index}`,
      passwordHash: "unused-isolated-export-fixture", phone: index === 0 ? "+21620123456" : null,
      role: "USER" as const, status: index % 2 ? "PENDING" as const : "REJECTED" as const,
    })) });
    const student = await db.user.findUniqueOrThrow({ where: { email: `export-${prefix}-0@test.invalid` } });
    for (const name of ["Équipe B", "Équipe A"]) await db.group.create({ data: { name, members: { create: { userId: student.id } } } });
    const path = "/api/v1/admin/students/export";
    await api().get(path).expect(401);
    for (const role of ["USER", "COLLABORATOR", "PENDING"]) await api().get(path).set(auth(role)).expect(403);
    await api().get(`${path}?language=invalid`).set(auth()).expect(400);
    const count = await db.user.count({ where: { role: "USER" } });
    const excluded = await db.user.findMany({ where: { role: { not: "USER" } }, select: { email: true } });
    for (const language of ["fr", "en"]) {
      const response = await api().get(`${path}?language=${language}`).set(auth()).buffer(true).parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => done(null, Buffer.concat(chunks)));
        res.on("error", error => done(error, null));
      }).expect(200);
      expect(response.headers["content-type"]).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.headers["content-disposition"]).toContain('filename="chtaw-team-students.xlsx"');
      const workbook = new Workbook(); await workbook.xlsx.load(response.body);
      const sheet = workbook.worksheets[0]!;
      expect(sheet.rowCount).toBe(count + 1);
      expect(sheet.columnCount).toBe(5);
      expect(sheet.getRow(1).values).toEqual([undefined, ...(language === "en" ? ["Last name", "First name", "Email", "Phone number", "Groups"] : ["Nom", "Prénom", "Email", "Téléphone", "Groupes"])]);
      let exported = 0;
      sheet.eachRow((row, number) => {
        if (number === 1) return;
        expect(excluded.map(user => user.email)).not.toContain(row.getCell(3).text);
        if (row.getCell(3).text.startsWith(`export-${prefix}-`)) exported++;
        if (row.getCell(3).text === student.email) {
          expect(row.getCell(1).type).toBe(ValueType.String);
          expect(row.getCell(1).value).toBe("=SUM(1,1)");
          expect(row.getCell(4).type).toBe(ValueType.String);
          expect(row.getCell(4).value).toBe("+21620123456");
          expect(row.getCell(5).value).toBe("Équipe A ; Équipe B");
        }
      });
      expect(exported).toBe(105);
    }
  });
});
