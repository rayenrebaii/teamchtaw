import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

// Call while holding the group row lock, shared by both creation and schedule edits.
export async function assertNoSessionOverlap(
  tx: Prisma.TransactionClient, groupId: string,
  input: { type?: string; startsAt?: string[]; slotEndsAt?: string[] }, excludeId?: string,
) {
  if (input.type !== "SESSION") return;
  for (const [index, startText] of (input.startsAt ?? []).entries()) {
    const start = new Date(startText);
    const end = input.slotEndsAt?.[index] ? new Date(input.slotEndsAt[index]!) : null;
    const conflict = await tx.pollOption.findFirst({
      where: {
        poll: { type: "SESSION", groupId, status: { not: "CANCELLED" }, archivedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}) },
        OR: end ? [
          { startsAt: { lt: end }, endsAt: { gt: start } },
          // Older slots with no end time can only be compared at their known start.
          { endsAt: null, startsAt: { gte: start, lt: end } },
        ] : [
          { startsAt: { lte: start }, endsAt: { gt: start } },
          { startsAt: start },
        ],
      },
      select: { id: true },
    });
    if (conflict) throw new ConflictException("Un créneau chevauche une autre séance de ce groupe, quel que soit son organisateur.");
  }
}
