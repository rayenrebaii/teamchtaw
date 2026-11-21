import "reflect-metadata";
import { FirebaseAccountDeletionService } from "../src/users/firebase-account-deletion.service";
import { UserBansService } from "../src/users/user-bans.service";
import type { Actor } from "../src/common/access";

function queue() {
  const db = { firebaseAccountDeletion: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([{ firebaseUid: "linked-uid" }]) }, user: { count: jest.fn().mockResolvedValue(0) } };
  const firebase = { enabled: true, deleteAccount: jest.fn().mockResolvedValue(undefined) };
  const service = new FirebaseAccountDeletionService(db as never, firebase as never);
  return { db, firebase, service };
}
it("deletes the linked identity and keeps a completed tombstone to prevent re-enrollment", async () => {
  const { db, firebase, service } = queue();
  await service.process("linked-uid");
  expect(firebase.deleteAccount).toHaveBeenCalledWith("linked-uid");
  expect(db.firebaseAccountDeletion.updateMany).toHaveBeenLastCalledWith({ where: { firebaseUid: "linked-uid", completedAt: null }, data: { completedAt: expect.any(Date) } });
});
it("retains a leased durable job after Firebase failure and can finish it on a later pass", async () => {
  const { db, firebase, service } = queue();
  firebase.deleteAccount.mockRejectedValueOnce(Error("Provider unavailable"));
  await expect(service.process("linked-uid")).resolves.toBeUndefined();
  expect(db.firebaseAccountDeletion.updateMany).toHaveBeenCalledTimes(1);
  expect(db.firebaseAccountDeletion.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 }, nextAttemptAt: expect.any(Date) } }));
  await service.drain();
  expect(firebase.deleteAccount).toHaveBeenCalledTimes(2);
  expect(db.firebaseAccountDeletion.updateMany).toHaveBeenCalledTimes(3);
});
it("does not delete an identity attached to an active account", async () => {
  const { db, firebase, service } = queue();
  db.user.count.mockResolvedValue(1);
  await service.process("linked-uid");
  expect(firebase.deleteAccount).not.toHaveBeenCalled();
});
it("does not duplicate a job leased by another instance", async () => {
  const { db, firebase, service } = queue();
  db.firebaseAccountDeletion.updateMany.mockResolvedValue({ count: 0 });
  await service.process("linked-uid");
  expect(firebase.deleteAccount).not.toHaveBeenCalled();
});
it("keeps the job when recording completion fails; a later idempotent deletion can retry", async () => {
  const { db, firebase, service } = queue();
  db.firebaseAccountDeletion.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(Error("Database unavailable"));
  await expect(service.process("linked-uid")).resolves.toBeUndefined();
  await service.process("linked-uid");
  expect(firebase.deleteAccount).toHaveBeenCalledTimes(2);
});

function deletion(role: "USER" | "COLLABORATOR" | "ADMIN", firebaseUid: string | null = "linked-uid") {
  const table = () => ({ findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn(), updateMany: jest.fn() });
  const target = { id: "target", role, status: "APPROVED", isInvitedAdmin: role === "ADMIN", firebaseUid };
  const tx = { $queryRaw: jest.fn(), $executeRaw: jest.fn(), user: { findUnique: jest.fn().mockResolvedValue(target), findMany: jest.fn().mockResolvedValue([]), delete: jest.fn(), update: jest.fn() },
    firebaseAccountDeletion: { upsert: jest.fn() }, refreshSession: table(), accountLink: table(), pushSubscription: table(), groupMember: table(), group: table(), media: table(), message: table(), poll: table(), organizerAbsenceAlert: table(), organizerAbsenceState: table(), sessionAttendanceEdit: table(), sessionMark: table(), sessionParticipant: table(), attendanceEdit: table(), pollVote: table(), notification: table(), admissionDecision: table() };
  const state = { committed: false, rollback: false };
  const db = { $transaction: jest.fn(async (work: (value: typeof tx) => Promise<unknown>) => { const result = await work(tx); if (state.rollback) throw Error("Commit failed"); state.committed = true; return result; }) };
  const cleanup = { process: jest.fn(async () => { expect(state.committed).toBe(true); }) };
  const service = new UserBansService(db as never, { actor: jest.fn() } as never, { publish: jest.fn() } as never, {} as never, cleanup as never);
  return { tx, service, cleanup, state };
}
const actor = { id: "principal", role: "ADMIN" } as Actor;
it.each(["USER", "COLLABORATOR", "ADMIN"] as const)("queues and processes Firebase deletion after committing removal of %s", async role => {
  const { tx, service, cleanup } = deletion(role);
  await service.remove(actor, "target");
  expect(tx.firebaseAccountDeletion.upsert).toHaveBeenCalledWith({ where: { firebaseUid: "linked-uid" }, create: { firebaseUid: "linked-uid" }, update: {} });
  expect(cleanup.process).toHaveBeenCalledWith("linked-uid");
  if (role === "ADMIN") { expect(tx.user.delete).not.toHaveBeenCalled(); expect(tx.user.update).toHaveBeenCalled(); }
  else expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: "target" } });
});
it("never calls Firebase if the database transaction rolls back", async () => {
  const { service, cleanup, state } = deletion("USER");
  state.rollback = true;
  await expect(service.remove(actor, "target")).rejects.toThrow("Commit failed");
  expect(cleanup.process).not.toHaveBeenCalled();
});
it("does not infer a Firebase account from an unlinked user's email", async () => {
  const { tx, service, cleanup } = deletion("USER", null);
  await service.remove(actor, "target");
  expect(tx.firebaseAccountDeletion.upsert).not.toHaveBeenCalled();
  expect(cleanup.process).not.toHaveBeenCalled();
});
