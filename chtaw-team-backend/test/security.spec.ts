import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { validateEnvironment } from "../src/config/environment";
import { RegisterDto } from "../src/auth/auth.dto";
import { CreatePollDto, VoteDto } from "../src/polls/polls.dto";
import { SendEventDto } from "../src/realtime/realtime.module";
import { AccessService, Actor } from "../src/common/access";
import { sanitizeImage } from "../src/uploads/uploads.module";
import { LocalMediaStorage } from "../src/uploads/storage.module";
import { ProfileDto } from "../src/users/users.module";
import { UpdateGroupDto } from "../src/groups/groups.dto";
const environment = {
  DATABASE_URL: "postgresql://x:y@localhost:5434/chtaw",
  JWT_ACCESS_SECRET: "a".repeat(64),
  JWT_REFRESH_SECRET: "b".repeat(64),
  CORS_ORIGINS: "http://localhost:3001",
};
describe("Configuration", () => {
  it("refuse les secrets absents ou identiques", () => {
    expect(() => validateEnvironment({ ...environment, JWT_ACCESS_SECRET: "" })).toThrow();
    expect(() =>
      validateEnvironment({ ...environment, JWT_REFRESH_SECRET: "a".repeat(64) }),
    ).toThrow();
  });
  it("refuse les origines génériques et HTTP en production", () => {
    expect(() => validateEnvironment({ ...environment, CORS_ORIGINS: "*" })).toThrow();
    expect(() => validateEnvironment({ ...environment, NODE_ENV: "production" })).toThrow();
  });
  it("refuse les limites incohérentes", () => {
    expect(() => validateEnvironment({ ...environment, ACCESS_TTL_SECONDS: 0 })).toThrow();
    expect(() => validateEnvironment({ ...environment, UPLOAD_MAX_BYTES: 20000000 })).toThrow();
  });
  it("normalise la configuration valide", () => {
    const result = validateEnvironment(environment);
    expect(result.PORT).toBe(3002);
    expect(result.CORS_ORIGINS).toEqual(["http://localhost:3001"]);
  });
});
async function errors(type: new () => object, data: unknown) {
  return validate(plainToInstance(type, data), { whitelist: true, forbidNonWhitelisted: true });
}
describe("DTO stricts", () => {
  it("refuse null pour les champs obligatoires d’un profil ou d’un groupe", async () => {
    expect(await errors(ProfileDto, { firstName: null })).not.toHaveLength(0);
    expect(await errors(UpdateGroupDto, { name: null, description: null })).not.toHaveLength(0);
  });
  const registration = {
    email: " MEMBER@example.com ",
    password: "a-long-fake-password",
    firstName: " Amin ",
    lastName: " Test ",
  };
  it("normalise email et noms", async () => {
    const dto = plainToInstance(RegisterDto, registration);
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.email).toBe("member@example.com");
    expect(dto.firstName).toBe("Amin");
  });
  it("interdit rôle et statut dans une inscription publique", async () => {
    expect(
      await errors(RegisterDto, { ...registration, role: "ADMIN", status: "APPROVED" }),
    ).not.toHaveLength(0);
  });
  it("refuse les mots de passe courts", async () => {
    expect(await errors(RegisterDto, { ...registration, password: "short" })).not.toHaveLength(0);
  });
  it("valide les options et booléens sans coercition implicite", async () => {
    expect(
      await errors(CreatePollDto, {
        question: "Quand ?",
        options: ["Oui", "Non"],
        singleChoice: true,
      }),
    ).toHaveLength(0);
    expect(
      await errors(CreatePollDto, {
        question: "Quand ?",
        options: ["Oui", "Oui"],
        singleChoice: "false",
      }),
    ).not.toHaveLength(0);
  });
  it("refuse les votes dupliqués et les champs d’usurpation", async () => {
    const id = randomUUID();
    expect(await errors(VoteDto, { optionIds: [id, id] })).not.toHaveLength(0);
    expect(
      await errors(SendEventDto, { text: "Hello", groupId: id, authorId: randomUUID() }),
    ).not.toHaveLength(0);
  });
});
describe("Autorisations", () => {
  const access = new AccessService();
  const actor = {
    id: randomUUID(),
    sessionId: randomUUID(),
    status: "APPROVED",
    role: "USER",
  } as Actor;
  const tx = (session: unknown, member: unknown) =>
    ({
      refreshSession: { findUnique: jest.fn().mockResolvedValue(session) },
      $queryRaw: jest.fn().mockResolvedValue([]),
      group: { findUnique: jest.fn().mockResolvedValue({ id: "g" }) },
      groupMember: { findUnique: jest.fn().mockResolvedValue(member) },
    }) as unknown as Prisma.TransactionClient;
  const session = (status = "APPROVED", role = "USER") => ({
    userId: actor.id,
    expiresAt: new Date(Date.now() + 60000),
    revokedAt: null,
    user: { id: actor.id, status, role },
  });
  it("refuse une session révoquée", async () => {
    await expect(
      access.actor(tx({ ...session(), revokedAt: new Date() }, true), actor),
    ).rejects.toThrow("Session expirée");
  });
  it("refuse un compte en attente malgré des claims approuvés", async () => {
    await expect(access.actor(tx(session("PENDING"), true), actor)).rejects.toThrow(
      "Compte non approuvé",
    );
  });
  it("refuse les groupes étrangers", async () => {
    await expect(access.group(tx(session(), null), actor, randomUUID())).rejects.toThrow(
      "Vous ne faites pas partie",
    );
  });
  it("refuse les actions admin aux membres", async () => {
    await expect(access.group(tx(session(), true), actor, randomUUID(), true)).rejects.toThrow(
      "Administrateur requis",
    );
  });
  it("autorise un membre approuvé du groupe", async () => {
    await expect(access.group(tx(session(), true), actor, randomUUID())).resolves.toEqual({
      id: "g",
    });
  });
});
describe("Images", () => {
  it("ignore le type déclaré et vérifie les vrais octets", async () => {
    await expect(sanitizeImage(Buffer.from("fake png"), 1000)).rejects.toThrow();
  });
  it("refuse SVG et les dépassements de taille", async () => {
    await expect(
      sanitizeImage(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'),
        1000,
      ),
    ).rejects.toThrow();
    await expect(sanitizeImage(Buffer.alloc(100), 50)).rejects.toThrow();
  });
  it("réencode un PNG en WebP sans conserver l’original", async () => {
    const png = await sharp({
      create: { width: 10, height: 12, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    const image = await sanitizeImage(png, 5000);
    expect((await sharp(image.buffer).metadata()).format).toBe("webp");
    expect(image.width).toBe(10);
    expect(image.height).toBe(12);
  });
  it("refuse les chemins de stockage arbitraires", async () => {
    const storage = new LocalMediaStorage(new ConfigService({ UPLOAD_DIR: process.cwd() }));
    await expect(storage.open("../secret.env")).rejects.toThrow("Invalid storage key");
  });
});
