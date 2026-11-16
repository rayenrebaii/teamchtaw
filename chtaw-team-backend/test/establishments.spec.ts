import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ForbiddenException, NotFoundException, ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { EstablishmentDto } from "../src/establishments/establishments.dto";
import { EstablishmentsService } from "../src/establishments/establishments.service";
import { Actor } from "../src/common/access";

describe("Establishments validation and service boundary", () => {
  it.each([undefined, null, "", " \t\n ", 42, [], "a".repeat(121)])("rejects an invalid name (%p)", async name => {
    const dto = plainToInstance(EstablishmentDto, { name });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
  it("trims without changing the business name or adding fields", async () => {
    const dto = plainToInstance(EstablishmentDto, { name: "  Lycée Pilote de Tunis  " });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.name).toBe("Lycée Pilote de Tunis");
  });
  it("rejects extra business fields", async () => {
    const dto = plainToInstance(EstablishmentDto, { name: "Lycée", address: "Forbidden" });
    expect((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length).toBeGreaterThan(0);
  });
  it("rechecks administrator access before every database operation", async () => {
    const table = { findMany: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() };
    const tx = { establishment: table };
    const access = { actor: jest.fn().mockRejectedValue(new ForbiddenException()) };
    const db = { $transaction: async (run: (tx: unknown) => unknown) => run(tx) };
    const service = new EstablishmentsService(db as never, access as never);
    const actor = { id: "fixture" } as Actor;
    for (const operation of [() => service.list(actor), () => service.get(actor, "id"), () => service.create(actor, { name: "School" }), () => service.update(actor, "id", { name: "School" }), () => service.remove(actor, "id")]) {
      await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
      expect(access.actor).toHaveBeenLastCalledWith(tx, actor, true, true);
    }
    for (const method of Object.values(table)) expect(method).not.toHaveBeenCalled();
  });
  it.each([["P2002", ConflictException], ["P2025", NotFoundException]] as const)("maps %s to a useful HTTP error", async (code, errorType) => {
    const db = { $transaction: jest.fn().mockRejectedValue(new Prisma.PrismaClientKnownRequestError("Fixture", { code, clientVersion: "test" })) };
    const service = new EstablishmentsService(db as never, {} as never);
    await expect(service.update({} as Actor, "id", { name: "School" })).rejects.toBeInstanceOf(errorType);
  });
});
