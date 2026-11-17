import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { AccessService, Actor } from "../src/common/access";
import { DomainEvents } from "../src/common/events";
import { PrismaService } from "../src/prisma/prisma.module";
import { MessagesService } from "../src/messages/messages.module";
import { PollDeletionService } from "../src/polls/poll-deletion.service";
import { reconcileAbsences } from "../src/polls/attendance.reconcile";
jest.mock("../src/polls/attendance.reconcile", () => ({ reconcileAbsences: jest.fn() }));
function fixture(role: Actor["role"], authorId = "other") {
  const actor = { id: "actor", role } as Actor;
  const poll = { id: "poll", groupId: "group", authorId, type: "SESSION", options: [{ startsAt: new Date("2099-01-01") }], votes: [], participants: [], group: { name: "Test" } };
  const tx = {
    $queryRaw: jest.fn(), $executeRaw: jest.fn(),
    poll: { findUnique: jest.fn().mockResolvedValue(poll), delete: jest.fn(), update: jest.fn() },
    message: { findFirst: jest.fn().mockResolvedValue({ id: "message", groupId: "group", authorId }), findMany: jest.fn().mockResolvedValue([{ id: "message" }]), delete: jest.fn(), deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    sessionReminderDelivery: { deleteMany: jest.fn() },
    sessionAttendanceEdit: { deleteMany: jest.fn() }, sessionMark: { deleteMany: jest.fn() },
    sessionParticipant: { deleteMany: jest.fn() }, attendanceEdit: { deleteMany: jest.fn() },
  };
  const db = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  const access = {
    poll: jest.fn(),
    organizer: jest.fn().mockImplementation(async () => {
      if (role === "USER") throw new ForbiddenException();
      return { id: actor.id, role };
    }),
    group: jest.fn().mockImplementation(async (_tx, _actor, _group, admin) => {
      if (admin && role !== "ADMIN") throw new ForbiddenException();
    }),
  };
  const events = { publish: jest.fn() };
  return { actor, poll, tx, access, events,
    polls: new PollDeletionService(db, access as unknown as AccessService, events as unknown as DomainEvents),
    messages: new MessagesService(db, access as unknown as AccessService, events as unknown as DomainEvents) };
}

describe("Permanent session deletion", () => {
  it("deletes all attendance and history, then reconciles counters instead of archiving", async () => {
    const f = fixture("ADMIN");
    await f.polls.remove(f.actor, "poll");
    expect(f.tx.sessionMark.deleteMany).toHaveBeenCalledWith({ where: { pollId: "poll" } });
    expect(f.tx.sessionAttendanceEdit.deleteMany).toHaveBeenCalledWith({ where: { pollId: "poll" } });
    expect(f.tx.attendanceEdit.deleteMany).toHaveBeenCalledWith({ where: { selection: { pollId: "poll" } } });
    expect(f.tx.poll.delete).toHaveBeenCalledWith({ where: { id: "poll" } });
    expect(f.tx.$executeRaw).toHaveBeenCalled();
    expect(reconcileAbsences).toHaveBeenCalledWith(f.tx, [], "Test");
    expect(f.tx.poll.delete.mock.invocationCallOrder[0]).toBeLessThan(jest.mocked(reconcileAbsences).mock.invocationCallOrder.at(-1)!);
  });
  it("retains collaborator ownership restrictions", async () => {
    const f = fixture("COLLABORATOR");
    await expect(f.polls.remove(f.actor, "poll")).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.poll.delete).not.toHaveBeenCalled();
  });
  it("archives a started session without deleting attendance or recalculating history", async () => {
    const f = fixture("ADMIN");
    f.poll.options[0]!.startsAt = new Date("2020-01-01");
    await f.polls.remove(f.actor, "poll");
    expect(f.tx.poll.update).toHaveBeenCalledWith({ where: { id: "poll" }, data: { archivedAt: expect.any(Date) } });
    expect(f.tx.poll.delete).not.toHaveBeenCalled();
    expect(f.tx.sessionMark.deleteMany).not.toHaveBeenCalled();
    expect(f.tx.attendanceEdit.deleteMany).not.toHaveBeenCalled();
  });
});
