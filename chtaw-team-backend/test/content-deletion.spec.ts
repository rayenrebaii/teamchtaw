import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { AccessService, Actor } from "../src/common/access";
import { DomainEvents } from "../src/common/events";
import { PrismaService } from "../src/prisma/prisma.module";
import { MessagesService } from "../src/messages/messages.module";
import { PollDeletionService } from "../src/polls/poll-deletion.service";

function fixture(role: Actor["role"], authorId = "other") {
  const actor = { id: "actor", role } as Actor;
  const poll = { id: "poll", groupId: "group", authorId, type: "ORDINARY", votes: [], participants: [], group: { name: "Test" } };
  const tx = {
    $queryRaw: jest.fn(),
    poll: { findUnique: jest.fn().mockResolvedValue(poll), delete: jest.fn() },
    message: { findFirst: jest.fn().mockResolvedValue({ id: "message", groupId: "group", authorId }), findMany: jest.fn().mockResolvedValue([{ id: "message" }]), delete: jest.fn(), deleteMany: jest.fn() },
    notification: { deleteMany: jest.fn() },
    sessionReminderDelivery: { deleteMany: jest.fn() },
    sessionAttendanceEdit: { deleteMany: jest.fn() }, sessionMark: { deleteMany: jest.fn() },
    sessionParticipant: { deleteMany: jest.fn() }, attendanceEdit: { deleteMany: jest.fn() },
  };
  const db = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  const access = {
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

describe("Suppression des contenus", () => {
  it.each(["actor", "other"])("permet à l’admin de supprimer un message de %s", async (author) => {
    const f = fixture("ADMIN", author);
    await f.messages.remove(f.actor, "group", "message");
    expect(f.access.group).toHaveBeenCalledWith(f.tx, f.actor, "group", true);
    expect(f.tx.message.findFirst).toHaveBeenCalledWith({ where: { id: "message", groupId: "group" } });
    expect(f.tx.message.delete).toHaveBeenCalled();
    expect(f.events.publish).toHaveBeenCalledWith({ name: "message:deleted", groupId: "group", payload: { messageId: "message" } });
  });
  it.each(["USER", "COLLABORATOR"] as const)("interdit à %s de supprimer même son propre message", async (role) => {
    const f = fixture(role, "actor");
    await expect(f.messages.remove(f.actor, "group", "message")).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.message.delete).not.toHaveBeenCalled();
    expect(f.events.publish).not.toHaveBeenCalled();
  });
  it.each(["actor", "other"])("permet à l’admin de supprimer le sondage de %s", async (author) => {
    const f = fixture("ADMIN", author);
    await f.polls.remove(f.actor, "poll");
    expect(f.tx.message.deleteMany).toHaveBeenCalledWith({ where: { pollId: "poll" } });
    expect(f.tx.poll.delete).toHaveBeenCalledWith({ where: { id: "poll" } });
    expect(f.events.publish).toHaveBeenCalledWith({ name: "poll:deleted", groupId: "group", payload: { pollId: "poll" } });
  });
  it("permet au collaborateur de supprimer son sondage", async () => {
    const f = fixture("COLLABORATOR", "actor");
    await f.polls.remove(f.actor, "poll");
    expect(f.tx.poll.delete).toHaveBeenCalled();
  });
  it.each(["USER", "COLLABORATOR"] as const)("interdit à %s de supprimer le sondage d’un autre", async (role) => {
    const f = fixture(role);
    await expect(f.polls.remove(f.actor, "poll")).rejects.toBeInstanceOf(ForbiddenException);
    expect(f.tx.poll.delete).not.toHaveBeenCalled();
    expect(f.events.publish).not.toHaveBeenCalled();
  });
  it("refuse un message absent du groupe sans publier de suppression", async () => {
    const f = fixture("ADMIN");
    f.tx.message.findFirst.mockResolvedValue(null);
    await expect(f.messages.remove(f.actor, "wrong-group", "message")).rejects.toThrow("Message introuvable");
    expect(f.tx.message.delete).not.toHaveBeenCalled();
    expect(f.events.publish).not.toHaveBeenCalled();
  });
  it("ne publie aucun événement lorsque la suppression échoue", async () => {
    const f = fixture("ADMIN");
    f.tx.poll.delete.mockRejectedValue(new Error("transaction failed"));
    await expect(f.polls.remove(f.actor, "poll")).rejects.toThrow("transaction failed");
    expect(f.events.publish).not.toHaveBeenCalled();
  });
});
