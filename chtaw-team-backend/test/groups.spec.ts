import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { GroupsService } from "../src/groups/groups.service";
import { AccessService, Actor } from "../src/common/access";
describe("Affectations du groupe général", () => {
  it.each([true, false])("refuse la modification manuelle add=%s", async (add) => {
    const tx = { groupMember: { deleteMany: jest.fn(), upsert: jest.fn() } };
    const access = { group: jest.fn().mockResolvedValue({ id: "general", isGeneral: true }) };
    const service = new GroupsService({ $transaction: async (run: (value: unknown) => unknown) => run(tx) } as never, access as never, { publish: jest.fn() } as never, {} as never);
    await expect(service.member({ id: "admin" } as Actor, "general", "member", add)).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.group).toHaveBeenCalledWith(tx, { id: "admin" }, "general", true);
    expect(tx.groupMember.deleteMany).not.toHaveBeenCalled();
    expect(tx.groupMember.upsert).not.toHaveBeenCalled();
  });
  it.each(["USER", "ADMIN"])("vérifie le rôle réel %s avant une affectation", async (role) => {
    const access = new AccessService();
    const tx = { refreshSession: { findUnique: async () => ({ userId: "actor", revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: { role, status: "APPROVED" } }) } };
    const result = access.actor(tx as never, { id: "actor", sessionId: "session" } as Actor, true, true);
    if (role === "USER") await expect(result).rejects.toBeInstanceOf(ForbiddenException);
    else await expect(result).resolves.toMatchObject({ role: "ADMIN" });
  });
});
