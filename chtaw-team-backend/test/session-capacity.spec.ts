import "reflect-metadata";
import { PollsService } from "../src/polls/polls.module";
import { PrismaService } from "../src/prisma/prisma.module";
import { AccessService, Actor } from "../src/common/access";
import { DomainEvents } from "../src/common/events";

function fixture() {
  const actor = { id: "student", role: "USER" } as Actor;
  const options = ["a", "b"].map((id) => ({ id, label: id, startsAt: new Date("2099-01-01T10:00:00Z"), endsAt: new Date("2099-01-01T11:30:00Z"), capacity: 1 }));
  const current = { id: "poll", groupId: "group", type: "SESSION", status: "OPEN", singleChoice: false, attendanceLockedAt: null, endsAt: null, options, votes: [] };
  const existing = { id: "vote", userId: actor.id, options: [{ optionId: "a", version: 0, attendance: "NON_VERIFIE" }] };
  const tx = {
    $queryRaw: jest.fn(),
    poll: { findUnique: jest.fn().mockResolvedValue(current), findUniqueOrThrow: jest.fn().mockResolvedValue(current) },
    pollVote: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue(existing), delete: jest.fn() },
    pollVoteOption: { count: jest.fn().mockResolvedValue(0), deleteMany: jest.fn(), createMany: jest.fn() },
    sessionMark: { count: jest.fn().mockResolvedValue(0) },
    sessionParticipant: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const db = { $transaction: (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaService;
  const access = { group: jest.fn() } as unknown as AccessService;
  const events = { publish: jest.fn() };
  return { actor, options, existing, current, tx, events, service: new PollsService(db, access, events as unknown as DomainEvents) };
}

describe("Session single reservation", () => {
  it("rejects a second POST and multiple selections, even on a legacy singleChoice=false session", async () => {
    const f = fixture();
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["b"] })).rejects.toThrow();
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["a", "b"] }, true)).rejects.toThrow();
    expect(f.tx.pollVoteOption.deleteMany).not.toHaveBeenCalled();
  });
  it("changes the choice under the poll lock, checking the target before releasing the original", async () => {
    const f = fixture();
    await f.service.vote(f.actor, "poll", { optionIds: ["b"] }, true);
    expect(f.tx.$queryRaw).toHaveBeenCalled();
    expect(f.tx.pollVoteOption.createMany).toHaveBeenCalledWith({ data: [{ voteId: "vote", optionId: "b", pollId: "poll" }] });
    expect(f.tx.pollVoteOption.count.mock.invocationCallOrder[0]).toBeLessThan(f.tx.pollVoteOption.deleteMany.mock.invocationCallOrder[0]!);
  });
  it("refuses a full target without deleting the original reservation", async () => {
    const f = fixture(); f.tx.pollVoteOption.count.mockResolvedValue(1);
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["b"] }, true)).rejects.toThrow("complet");
    expect(f.tx.pollVoteOption.deleteMany).not.toHaveBeenCalled();
    expect(f.events.publish).not.toHaveBeenCalled();
  });
  it("keeps one's own full slot without rewriting attendance", async () => {
    const f = fixture(); f.tx.pollVoteOption.count.mockResolvedValue(1);
    await f.service.vote(f.actor, "poll", { optionIds: ["a"] }, true);
    expect(f.tx.pollVoteOption.deleteMany).not.toHaveBeenCalled();
  });
  it("allows withdrawal before start", async () => {
    const f = fixture();
    await f.service.vote(f.actor, "poll", { optionIds: [] }, true);
    expect(f.tx.pollVote.delete).toHaveBeenCalledWith({ where: { id: "vote" } });
  });
  it("closes at the exact start, including withdrawal and switching away", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2099-01-01T10:00:00Z"));
    try {
      const f = fixture();
      for (const optionIds of [[], ["a"], ["b"]])
        await expect(f.service.vote(f.actor, "poll", { optionIds }, true)).rejects.toThrow("commencé");
      expect(f.tx.pollVoteOption.deleteMany).not.toHaveBeenCalled();
    } finally { jest.useRealTimers(); }
  });
  it("leaves future slots open when a different student's attendance has started", async () => {
    const f = fixture(); f.current.attendanceLockedAt = new Date() as never;
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["b"] }, true)).resolves.toBeDefined();
  });
  it.each(["marks", "ballot", "confirmation"])("blocks changes after personal attendance: %s", async (kind) => {
    const f = fixture();
    if (kind === "marks") f.tx.sessionMark.count.mockResolvedValue(1);
    if (kind === "ballot") f.existing.options[0]!.version = 2;
    if (kind === "confirmation") f.tx.sessionParticipant.findUnique.mockResolvedValue({ absenceConfirmedAt: new Date() } as never);
    await expect(f.service.vote(f.actor, "poll", { optionIds: [] }, true)).rejects.toThrow("pointage");
  });
  it("respects manual closure for both new votes and changes", async () => {
    const f = fixture(); f.current.status = "CLOSED";
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["b"] }, true)).rejects.toThrow("clôturé");
  });
  it("preserves historical multiple selections", async () => {
    const f = fixture(); f.existing.options.push({ optionId: "b", version: 0, attendance: "NON_VERIFIE" });
    await expect(f.service.vote(f.actor, "poll", { optionIds: ["a"] }, true)).rejects.toThrow("historiques");
    expect(f.tx.pollVoteOption.deleteMany).not.toHaveBeenCalled();
  });
  it("does not allow withdrawing ordinary polls", async () => {
    const f = fixture(); f.current.type = "ORDINARY";
    await expect(f.service.vote(f.actor, "poll", { optionIds: [] }, true)).rejects.toThrow("définitifs");
  });
});
