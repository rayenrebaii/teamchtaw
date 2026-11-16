import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AccessService, Actor } from "../common/access";
import { PrismaService } from "../prisma/prisma.module";
import { EstablishmentDto } from "./establishments.dto";
import { lockSchools, matchingSchool, normalizeSchoolName } from "./student-schools.service";

@Injectable()
export class EstablishmentsService {
  constructor(private db: PrismaService, private access: AccessService) {}

  private async asAdmin<T>(actor: Actor, run: (tx: Prisma.TransactionClient) => Promise<T>) {
    try {
      return await this.db.$transaction(async tx => {
        await this.access.actor(tx, actor, true, true);
        await lockSchools(tx);
        return run(tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002") throw new ConflictException("Un établissement portant ce nom existe déjà.");
        if (error.code === "P2025") throw new NotFoundException("Établissement introuvable.");
        if (error.code === "P2003") throw new ConflictException("Cet établissement est utilisé par des étudiants et ne peut pas être supprimé.");
      }
      throw error;
    }
  }

  list(actor: Actor) {
    return this.asAdmin(actor, tx => tx.establishment.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }] }));
  }
  get(actor: Actor, id: string) {
    return this.asAdmin(actor, tx => tx.establishment.findUniqueOrThrow({ where: { id } }));
  }
  create(actor: Actor, dto: EstablishmentDto) {
    return this.asAdmin(actor, async tx => {
      if (await matchingSchool(tx, dto.name)) throw new ConflictException("Un établissement portant ce nom existe déjà.");
      return tx.establishment.create({ data: { name: normalizeSchoolName(dto.name) } });
    });
  }
  update(actor: Actor, id: string, dto: EstablishmentDto) {
    return this.asAdmin(actor, async tx => {
      const existing = await matchingSchool(tx, dto.name);
      if (existing && existing.id !== id) throw new ConflictException("Un établissement portant ce nom existe déjà.");
      return tx.establishment.update({ where: { id }, data: { name: normalizeSchoolName(dto.name) } });
    });
  }
  async remove(actor: Actor, id: string) {
    await this.asAdmin(actor, tx => tx.establishment.delete({ where: { id } }));
  }
}
