import "reflect-metadata";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import { GroupJoinRequestsService } from "../src/groups/group-join-requests.service";
import type { Actor } from "../src/common/access";

describe("Group join request safeguards", () => {
  const actor = { id: "client" } as Actor;
  function setup() {
    const tx = { $queryRaw: jest.fn(), group: { findMany: jest.fn() },
      groupMember: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      groupJoinRequest: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "request", status: "PENDING" }),
        findMany: jest.fn(), update: jest.fn().mockResolvedValue({ id: "request", userId: "client", groupId: "private", status: "APPROVED" }) } };
    const access = { actor: jest.fn().mockResolvedValue({ role: "USER" }), lockGroup: jest.fn().mockResolvedValue({ id: "private", isGeneral: false }) };
    const events = { publish: jest.fn() };
    const service = new GroupJoinRequestsService({ $transaction: async (run: (value: unknown) => unknown) => run(tx) } as never, access as never, events as never);
    return { tx, access, events, service };
  }
  it("returns only the names and the requester's own membership and request state", async () => {
    const { tx, service } = setup();
    tx.group.findMany.mockResolvedValue([{ id: "private", name: "G1", isGeneral: false, members: [], joinRequests: [{ status: "REJECTED" }] }]);
    await expect(service.directory(actor)).resolves.toEqual([{ id: "private", name: "G1", isGeneral: false, isMember: false, requestStatus: "REJECTED" }]);
    expect(tx.group.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({
      members: { where: { userId: actor.id }, select: { userId: true } }, joinRequests: { where: { userId: actor.id }, select: { status: true } },
    }) }));
  });
  it.each(["PENDING", "REJECTED", "APPROVED"])("rejects a second request when the previous one is %s", async (status) => {
    const { tx, service } = setup();
    tx.groupJoinRequest.findUnique.mockResolvedValue({ status });
    await expect(service.request(actor, "private")).rejects.toBeInstanceOf(ConflictException);
    expect(tx.groupJoinRequest.create).not.toHaveBeenCalled();
    expect(tx.groupMember.upsert).not.toHaveBeenCalled();
  });
  it.each(["USER", "COLLABORATOR"])("allows a first request by %s without adding a membership", async (role) => {
    const { tx, access, service } = setup();
    access.actor.mockResolvedValue({ role });
    await expect(service.request(actor, "private")).resolves.toEqual({ id: "request", status: "PENDING" });
    expect(tx.groupMember.upsert).not.toHaveBeenCalled();
  });
  it("requires admin authorization inside the service before listing or reviewing requests", async () => {
    const { tx, access, service } = setup();
    access.actor.mockRejectedValue(new ForbiddenException());
    await expect(service.pending(actor)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.review(actor, "request", "APPROVED")).rejects.toBeInstanceOf(ForbiddenException);
    expect(access.actor).toHaveBeenCalledWith(tx, actor, true, true);
    expect(tx.groupJoinRequest.update).not.toHaveBeenCalled();
  });
  it.each(["APPROVED", "REJECTED"] as const)("adds membership and sends an access event only for APPROVED (decision %s)", async (status) => {
    const { tx, service, events } = setup();
    tx.groupJoinRequest.findUnique.mockResolvedValue({ id: "request", groupId: "private", userId: "client", status: "PENDING", user: { role: "USER", status: "APPROVED", disabledAt: null } });
    await service.review(actor, "request", status);
    expect(tx.groupMember.upsert).toHaveBeenCalledTimes(status === "APPROVED" ? 1 : 0);
    expect(events.publish).toHaveBeenCalledTimes(status === "APPROVED" ? 1 : 0);
    expect(tx.groupJoinRequest.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status, reviewedBy: actor.id }) }));
  });
  it("does not grant access to a disabled account", async () => {
    const { tx, service } = setup();
    tx.groupJoinRequest.findUnique.mockResolvedValue({ id: "request", groupId: "private", userId: "client", status: "PENDING", user: { role: "COLLABORATOR", status: "APPROVED", disabledAt: new Date() } });
    await expect(service.review(actor, "request", "APPROVED")).rejects.toBeInstanceOf(ConflictException);
    expect(tx.groupMember.upsert).not.toHaveBeenCalled();
    expect(tx.groupJoinRequest.update).not.toHaveBeenCalled();
  });
});
