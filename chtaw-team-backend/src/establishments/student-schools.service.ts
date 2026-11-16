import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.module";
import { AccessService, Actor } from "../common/access";
import { accountSelect as userSelect } from "../common/presenters";

export const normalizeSchoolName = (value: string) => value.trim().replace(/\s+/gu, " ");
export interface SchoolChoice { establishmentId?: string; proposedEstablishmentName?: string }
export async function lockSchools(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(171145, 1)`;
}
export async function matchingSchool(tx: Prisma.TransactionClient, name: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Establishment"
    WHERE lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')) = lower(${normalizeSchoolName(name)}) ORDER BY id LIMIT 1`;
  return rows[0];
}

@Injectable()
export class StudentSchoolsService {
  constructor(private db: PrismaService, private access: AccessService) {}

  async enrollment(tx: Prisma.TransactionClient, choice: SchoolChoice) {
    const proposed = typeof choice.proposedEstablishmentName === "string" ? normalizeSchoolName(choice.proposedEstablishmentName) : "";
    if (!!choice.establishmentId === !!proposed || (choice.establishmentId && choice.proposedEstablishmentName !== undefined) || (proposed && (proposed.length > 120 || choice.establishmentId !== undefined)))
      throw new BadRequestException("Choisissez un établissement ou proposez le nom de votre lycée.");
    await lockSchools(tx);
    if (choice.establishmentId) {
      const school = await tx.establishment.findUnique({ where: { id: choice.establishmentId } });
      if (!school) throw new BadRequestException("Choisissez un établissement officiel valide.");
      return { establishmentId: school.id };
    }
    const normalizedName = proposed.toLowerCase();
    const pending = await tx.establishmentSuggestion.findFirst({ where: { normalizedName, status: "PENDING" } });
    const suggestion = pending ?? await tx.establishmentSuggestion.create({ data: { name: proposed, normalizedName } });
    return { establishmentSuggestionId: suggestion.id };
  }
  async suggestions(actor: Actor) {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      return tx.establishmentSuggestion.findMany({ orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        include: { students: { where: { role: "USER" }, select: { id: true, firstName: true, lastName: true, establishment: { select: { id: true, name: true } } } } } });
    });
  }
  async review(actor: Actor, id: string, status: "APPROVED" | "REJECTED") {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      await lockSchools(tx);
      const suggestion = await tx.establishmentSuggestion.findUnique({ where: { id } });
      if (!suggestion) throw new NotFoundException("Suggestion introuvable.");
      if (suggestion.status !== "PENDING") throw new ConflictException("Cette suggestion a déjà été traitée.");
      let establishmentId: string | null = null;
      if (status === "APPROVED") {
        const school = await matchingSchool(tx, suggestion.name) ?? await tx.establishment.create({ data: { name: suggestion.name } });
        establishmentId = school.id;
        // A manual official assignment is never overwritten by an old suggestion.
        await tx.user.updateMany({ where: { role: "USER", establishmentSuggestionId: id, establishmentId: null }, data: { establishmentId } });
      }
      return tx.establishmentSuggestion.update({ where: { id }, data: { status, reviewedAt: new Date(), establishmentId } });
    });
  }
  async assign(actor: Actor, userId: string, establishmentId: string) {
    return this.db.$transaction(async tx => {
      await this.access.actor(tx, actor, true, true);
      await lockSchools(tx);
      await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!user) throw new NotFoundException("Compte introuvable.");
      if (user.role !== "USER") throw new BadRequestException("Seuls les étudiants peuvent être affectés à un établissement.");
      if (!await tx.establishment.findUnique({ where: { id: establishmentId } })) throw new BadRequestException("Choisissez un établissement officiel valide.");
      return tx.user.update({ where: { id: userId }, data: { establishmentId }, select: userSelect });
    });
  }
}
