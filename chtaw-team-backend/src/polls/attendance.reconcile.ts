import { Prisma } from "@prisma/client";
export function attendanceAccess(adminId: string): Prisma.UserWhereInput {
  const poll = { group: { members: { some: { userId: adminId } } } };
  return { OR: [{ votes: { some: { poll } } }, { sessionParticipants: { some: { poll } } }] };
}

export function mandatoryFinal(person: {
  included?: boolean;
  absenceConfirmedAt: Date | null;
  marks: { attendance: string }[];
}) {
  if (person.included === false) return "NON_CONCERNE";
  if (person.marks.some((mark) => mark.attendance === "PRESENT")) return "PRESENT";
  return person.absenceConfirmedAt ? "ABSENT" : "EN_ATTENTE";
}
export function sessionFinished(options: { endsAt: Date | null }[], now = new Date()) {
  return (
    options.length > 0 && options.every((option) => option.endsAt !== null && option.endsAt <= now)
  );
}
export function allSessionSlotsAbsent(
  options: { id: string }[],
  marks: { optionId: string; attendance: string }[],
) {
  return (
    options.length > 0 &&
    options.every((option) =>
      marks.some((mark) => mark.optionId === option.id && mark.attendance === "ABSENT"),
    )
  );
}
// Both attendance policies share the same cross-group counter and threshold history.
export async function reconcileAbsences(
  tx: Prisma.TransactionClient,
  ids: string[],
  groupName: string,
) {
  for (const userId of [...new Set(ids)].sort()) {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${userId}::uuid FOR UPDATE`;
    const legacy = await tx.pollVote.count({
      where: {
        userId,
        poll: { type: "SESSION", mandatoryAttendance: false, status: { not: "CANCELLED" } },
        options: { some: {}, every: { attendance: "ABSENT" } },
      },
    });
    const mandatory = await tx.sessionParticipant.count({
      where: {
        userId,
        included: true,
        absenceConfirmedAt: { not: null },
        poll: { status: { not: "CANCELLED" } },
        marks: { none: { attendance: "PRESENT" } },
      },
    });
    const total = legacy + mandatory;
    const previous = await tx.absenceState.findUnique({ where: { userId } });
    const crossed = total >= 3 && (previous?.total ?? 0) < 3;
    const generation = (previous?.generation ?? 0) + (crossed ? 1 : 0);
    await tx.absenceState.upsert({
      where: { userId },
      create: { userId, total, generation },
      update: { total, generation },
    });
    if (total < 3)
      await tx.absenceAlert.updateMany({
        where: { userId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
    if (crossed) await tx.absenceAlert.create({ data: { userId, generation, groupName } });
  }
}
