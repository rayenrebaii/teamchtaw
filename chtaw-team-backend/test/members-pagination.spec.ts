import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UsersService } from "../src/users/users.module";
import { MembersQueryDto } from "../src/users/members-query.dto";
import { PrismaService } from "../src/prisma/prisma.module";
import { AccessService, Actor } from "../src/common/access";

function setup(total = 1000) {
  const tx = { user: { count: jest.fn().mockResolvedValue(total), findMany: jest.fn().mockResolvedValue([{ id: "sixth-page-user" }]),
    groupBy: jest.fn().mockResolvedValue([{ status: "APPROVED", _count: { _all: 700 } }, { status: "PENDING", _count: { _all: 200 } }, { status: "REJECTED", _count: { _all: 100 } }]) } };
  const db = { $transaction: jest.fn(async work => work(tx)) };
  const access = { actor: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(db as unknown as PrismaService, access as unknown as AccessService);
  return { service, tx, access, db };
}
const actor = { id: "test-admin", role: "ADMIN" } as Actor;
it("reads only six records, applies filters in the database and returns counts without loading the directory", async () => {
  const { service, tx, access } = setup();
  const query = plainToInstance(MembersQueryDto, { page: "2", search: "Nadia Team", status: "PENDING", order: "oldest", groupId: "11111111-1111-4111-8111-111111111111", from: "2026-11-01T00:00:00.000Z", before: "2026-12-01T00:00:00.000Z" });
  expect(await validate(query)).toHaveLength(0);
  const result = await service.members(actor, query);
  expect(access.actor).toHaveBeenCalledWith(tx, actor, true, true);
  expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6, skip: 6, orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
    where: expect.objectContaining({ status: "PENDING", role: "USER", memberships: { some: { groupId: query.groupId } }, AND: expect.any(Array), joinedAt: { gte: new Date(query.from!), lt: new Date(query.before!) } }) }));
  expect(tx.user.count).toHaveBeenCalledWith({ where: expect.objectContaining({ role: "USER" }) });
  expect(tx.user.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { role: "USER" } }));
  expect(tx.user.findMany.mock.calls[0][0].where.AND).toHaveLength(2);
  expect(result).toMatchObject({ page: 2, pageSize: 6, total: 1000, counts: { ALL: 1000, APPROVED: 700, PENDING: 200, REJECTED: 100 } });
});
it("clamps the last page after deletions", async () => {
  const { service, tx } = setup(7);
  const result = await service.members(actor, plainToInstance(MembersQueryDto, { page: 167 }));
  expect(result.page).toBe(2);
  expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 6, skip: 6 }));
});
it("checks authorization before querying users", async () => {
  const { service, tx, access } = setup();
  access.actor.mockRejectedValue(Error("Forbidden"));
  await expect(service.members(actor, new MembersQueryDto())).rejects.toThrow("Forbidden");
  expect(tx.user.findMany).not.toHaveBeenCalled();
  expect(tx.user.count).not.toHaveBeenCalled();
});
it.each([{ page: 0 }, { page: 1.5 }, { page: 1000001 }, { groupId: "invalid" }, { status: "ALL" }, { search: "x".repeat(255) }, { from: "invalid" }, { order: "invalid" }])("rejects invalid query parameters %p", async input => {
  expect((await validate(plainToInstance(MembersQueryDto, input)))).not.toHaveLength(0);
});
