import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Actor, administrationOwner } from "../src/common/access";
import { UserBansService } from "../src/users/user-bans.service";
import { CollaboratorsService } from "../src/users/collaborators.module";
import { PollsService } from "../src/polls/polls.module";
import { AccountLinksService } from "../src/auth/account-links.service";

const principal = { id: "principal", role: "ADMIN", isInvitedAdmin: false };
const agent = { id: "agent", role: "ADMIN", isInvitedAdmin: true, principalAdminId: principal.id };

describe("Shared administration agents", () => {
  it("uses the principal's identity only for shared content", () => {
    expect(administrationOwner(principal)).toBe(principal.id);
    expect(administrationOwner(agent)).toBe(principal.id);
    expect(administrationOwner({ id: "collaborator" })).toBe("collaborator");
    expect(() => administrationOwner({ id: "orphan", isInvitedAdmin: true })).toThrow(ForbiddenException);
  });

  it("attaches an invitation made by an agent directly to the principal", async () => {
    const tx = { $queryRaw: jest.fn(), user: {
      findUnique: jest.fn().mockResolvedValue(null), create: jest.fn(async ({ data }) => ({ ...data, passwordHash: undefined })),
    } };
    const access = { actor: jest.fn().mockResolvedValue(agent) };
    const links = { issue: jest.fn().mockResolvedValue({ sent: true }) };
    const service = new CollaboratorsService({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never, access as never, links as never, { enabled: false } as never, {} as never);
    const result = await service.create(agent as Actor, { email: "fixture@test.invalid", firstName: "Fixture", lastName: "Agent" }, "ADMIN");
    expect(result.user).toMatchObject({ role: "ADMIN", isInvitedAdmin: true, principalAdminId: principal.id, status: "PENDING" });
    expect(links.issue).toHaveBeenCalledWith(result.user.id, "INVITE");
  });

  it("attributes sessions and their published cards to the principal", async () => {
    const tx = {
      $queryRaw: jest.fn(),
      pollOption: { findFirst: jest.fn().mockResolvedValue(null) },
      poll: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn(async ({ data }) => ({ ...data, id: "poll", options: [], votes: [], participants: [], groups: [] })) },
      message: { create: jest.fn(async ({ data }) => ({ ...data, id: "card" })) },
    };
    const service = new PollsService({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
      { organizer: jest.fn().mockResolvedValue(agent), group: jest.fn() } as never, { publish: jest.fn() } as never);
    const result = await service.create(agent as Actor, "group", { type: "SESSION", question: "Shared session", singleChoice: true, options: ["First", "Second"],
      capacities: [10, 10], startsAt: ["2099-01-01T10:00:00Z", "2099-01-01T12:00:00Z"], slotEndsAt: ["2099-01-01T11:00:00Z", "2099-01-01T13:00:00Z"] });
    expect(result.authorId).toBe(principal.id);
    expect(tx.message.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ authorId: principal.id }) }));
  });

  it.each([principal, agent])("rejects deleting the principal or oneself (%j)", async (target) => {
    const tx = { $queryRaw: jest.fn(), user: { findUnique: jest.fn().mockResolvedValue(target), delete: jest.fn() } };
    const service = new UserBansService({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
      { actor: jest.fn() } as never, {} as never, {} as never, { process: jest.fn() } as never);
    await expect(service.remove(agent as Actor, target.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  it("revokes an agent without deleting the principal's content or attendance audit records", async () => {
    const tx = {
      $queryRaw: jest.fn(), user: { findUnique: jest.fn().mockResolvedValue(agent), update: jest.fn(), delete: jest.fn() },
      refreshSession: { findMany: jest.fn().mockResolvedValue([{ id: "old-session" }]), updateMany: jest.fn() },
      accountLink: { updateMany: jest.fn() }, pushSubscription: { deleteMany: jest.fn() },
      groupMember: { findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() }, group: { findMany: jest.fn().mockResolvedValue([]) },
      sessionAttendanceEdit: { deleteMany: jest.fn() }, attendanceEdit: { deleteMany: jest.fn() }, poll: { deleteMany: jest.fn() }, message: { deleteMany: jest.fn() },
    };
    const events = { publish: jest.fn() };
    const service = new UserBansService({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never,
      { actor: jest.fn() } as never, events as never, {} as never, { process: jest.fn() } as never);
    await service.remove(principal as Actor, agent.id);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: agent.id }, data: { disabledAt: expect.any(Date) } });
    expect(tx.user.delete).not.toHaveBeenCalled();
    for (const table of [tx.sessionAttendanceEdit, tx.attendanceEdit, tx.poll, tx.message]) expect(table.deleteMany).not.toHaveBeenCalled();
    expect(tx.accountLink.updateMany).toHaveBeenCalled();
    expect(tx.refreshSession.updateMany).toHaveBeenCalled();
    expect(events.publish).toHaveBeenCalledWith({ name: "session:revoked", sessionId: "old-session", payload: {} });
  });

  it("activates a Firebase agent through the existing one-use invitation flow", async () => {
    const link = { id: "link", userId: agent.id, purpose: "INVITE", usedAt: null, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000),
      user: { ...agent, activatedAt: null, disabledAt: null, firebaseUid: "fixture-uid", email: "agent@test.invalid" } };
    const tx = { $queryRaw: jest.fn(), accountLink: { findUnique: jest.fn().mockResolvedValue(link), findUniqueOrThrow: jest.fn().mockResolvedValue(link), updateMany: jest.fn() },
      user: { update: jest.fn() }, group: { findMany: jest.fn().mockResolvedValue([{ id: "group" }]) }, groupMember: { createMany: jest.fn() },
      refreshSession: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() }, pushSubscription: { deleteMany: jest.fn() } };
    const firebase = { enabled: true, activateInvitation: jest.fn() };
    const service = new AccountLinksService({ $transaction: (fn: (tx: unknown) => unknown) => fn(tx) } as never, {} as never, firebase as never, {} as never);
    await service.activateFirebase("fixture-nonce", "mock-identity-token");
    expect(firebase.activateInvitation).toHaveBeenCalledWith("fixture-uid", "agent@test.invalid", "mock-identity-token", link.createdAt);
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: agent.id }, data: { activatedAt: expect.any(Date), emailVerified: true, status: "APPROVED" } });
    expect(tx.groupMember.createMany).toHaveBeenCalledWith({ data: [{ groupId: "group", userId: agent.id }], skipDuplicates: true });
  });
});
