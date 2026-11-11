import "reflect-metadata";
import { AccessService, Actor } from "../src/common/access";
import { validatePoll } from "../src/polls/polls.validation";
import { CreatePollDto } from "../src/polls/polls.dto";

describe("Final audit regressions", () => {
  const input: CreatePollDto = { type: "SESSION", mandatoryAttendance: true, question: "Audit session",
    singleChoice: false, options: ["First", "Second"], endsAt: "2099-01-01T06:00:00Z",
    startsAt: ["2099-01-02T08:00:00Z", "2099-01-02T10:00:00Z"],
    slotEndsAt: ["2099-01-02T10:00:00Z", "2099-01-02T12:00:00Z"] };

  it("allows a real administrator to access a group without membership", async () => {
    const access = new AccessService();
    const tx = { $queryRaw: jest.fn(), group: { findUnique: jest.fn().mockResolvedValue({ id: "group" }) },
      groupMember: { findUnique: jest.fn().mockResolvedValue(null) } };
    jest.spyOn(access, "actor").mockResolvedValue({ id: "admin", role: "ADMIN" } as never);
    await expect(access.group(tx as never, { id: "admin" } as Actor, "group")).resolves.toMatchObject({ id: "group" });
  });
  it.each(["USER", "COLLABORATOR"] as const)("still denies a non-member %s, even with a stale ADMIN claim", async (role) => {
    const access = new AccessService();
    const tx = { $queryRaw: jest.fn(), group: { findUnique: jest.fn().mockResolvedValue({ id: "group" }) },
      groupMember: { findUnique: jest.fn().mockResolvedValue(null) } };
    jest.spyOn(access, "actor").mockResolvedValue({ id: "actor", role } as never);
    await expect(access.group(tx as never, { id: "actor", role: "ADMIN" } as Actor, "group")).rejects.toThrow();
  });
  it("rechecks archival after acquiring the group lock", async () => {
    const access = new AccessService();
    const record = { groupId: "group", authorId: "admin", archivedAt: null as Date | null };
    const tx = { poll: { findUnique: jest.fn(async () => ({ ...record })) } };
    jest.spyOn(access, "group").mockImplementation(async () => { record.archivedAt = new Date(); return {} as never; });
    jest.spyOn(access, "organizer").mockResolvedValue({ role: "ADMIN" } as never);
    await expect(access.session(tx as never, { id: "admin" } as Actor, "poll")).rejects.toThrow("introuvable");
  });
  it("rejects overlapping slots inside a single session, retaining adjacent slots", () => {
    expect(() => validatePoll(input)).not.toThrow();
    expect(() => validatePoll({ ...input, startsAt: [input.startsAt![0]!, "2099-01-02T09:00:00Z"] })).toThrow();
  });
  it.each([
    ["2099-01-02T07:00:00Z", "2099-01-02T12:00:00Z"],
    ["2099-01-02T10:00:00Z"],
  ])("validates provided end times even in the legacy attendance mode", (...slotEndsAt) => {
    expect(() => validatePoll({ ...input, mandatoryAttendance: false, slotEndsAt })).toThrow();
  });
  it("preserves historical sessions whose end times were never recorded", () => {
    expect(() => validatePoll({ ...input, mandatoryAttendance: false, slotEndsAt: undefined }, true)).not.toThrow();
  });
});
