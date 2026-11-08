import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as argon2 from "argon2";
async function seed() {
  const url = process.env.DATABASE_URL;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (
    !url ||
    !email ||
    !email.includes("@") ||
    !password ||
    password.length < 16 ||
    password.length > 128
  )
    throw Error(
      "DATABASE_URL, SEED_ADMIN_EMAIL and a 16–128 character SEED_ADMIN_PASSWORD are required.",
    );
  const db = new PrismaClient({
    adapter: new PrismaPg(
      { connectionString: url },
      { schema: new URL(url).searchParams.get("schema") ?? "public" },
    ),
  });
  try {
    const hash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(841722)`;
      let general = await tx.group.findFirst({ where: { isGeneral: true } });
      if (!general)
        general = await tx.group.create({
          data: {
            name: "Team Chtaw — Général",
            color: "#e9d5ff",
            description: "Le point de rencontre de toute la team.",
            isGeneral: true,
          },
        });
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing && existing.role !== "ADMIN")
        throw Error("Refusing to promote an existing public account. Use a new seed email.");
      const admin =
        existing ??
        (await tx.user.create({
          data: {
            email,
            passwordHash: hash,
            firstName: process.env.SEED_ADMIN_FIRST_NAME ?? "Admin",
            lastName: process.env.SEED_ADMIN_LAST_NAME ?? "Chtaw",
            role: "ADMIN",
            status: "APPROVED",
          },
        }));
      if (admin.status !== "APPROVED") throw Error("Existing admin is not approved.");
      const groups = await tx.group.findMany();
      for (const group of groups)
        await tx.groupMember.upsert({
          where: { groupId_userId: { groupId: group.id, userId: admin.id } },
          create: { groupId: group.id, userId: admin.id },
          update: {},
        });
      const approved = await tx.user.findMany({
        where: { status: "APPROVED" },
        select: { id: true },
      });
      await tx.groupMember.createMany({
        data: approved.map((user) => ({ groupId: general!.id, userId: user.id })),
        skipDuplicates: true,
      });
    });
    console.log("General group and administrator verified. No credentials printed.");
  } finally {
    await db.$disconnect();
  }
}
void seed().catch(() => {
  console.error(
    "Seed failed. Check configuration; existing public accounts are never promoted and passwords are never reset.",
  );
  process.exitCode = 1;
});
