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
    await reconcileOrganizerAbsences(tx, userId, groupName);
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

// Serialized by the same student lock as attendance writers. One contribution per poll.
async function reconcileOrganizerAbsences(tx: Prisma.TransactionClient, userId: string, groupName: string) {
  const legacy = await tx.pollVote.findMany({ where: { userId,
      poll: { type: "SESSION", mandatoryAttendance: false, status: { not: "CANCELLED" } },
      options: { some: {}, every: { attendance: "ABSENT" } } },
      select: { pollId: true, poll: { select: { authorId: true, groupId: true } } } });
  const mandatory = await tx.sessionParticipant.findMany({ where: { userId, included: true, absenceConfirmedAt: { not: null },
      poll: { status: { not: "CANCELLED" } }, marks: { none: { attendance: "PRESENT" } } },
      select: { pollId: true, poll: { select: { authorId: true, groupId: true } } } });
  const previous = await tx.organizerAbsenceState.findMany({ where: { userId } });
  const rows = [...legacy, ...mandatory];
  const organizers = new Set([...rows.map((row) => row.poll.authorId), ...previous.map((row) => row.organizerId)]);
  for (const organizerId of [...organizers].sort()) {
    const contributions = rows.filter((row) => row.poll.authorId === organizerId);
    const pollIds = [...new Set(contributions.map((row) => row.pollId))].sort();
    const total = pollIds.length;
    const prior = previous.find((row) => row.organizerId === organizerId);
    const crossed = total >= 3 && (prior?.total ?? 0) < 3;
    const generation = (prior?.generation ?? 0) + (crossed ? 1 : 0);
    await tx.organizerAbsenceState.upsert({ where: { userId_organizerId: { userId, organizerId } },
      create: { userId, organizerId, total, generation }, update: { total, generation } });
    if (total < 3) await tx.organizerAbsenceAlert.updateMany({ where: { userId, organizerId, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (total >= 3) await tx.organizerAbsenceAlert.updateMany({ where: { userId, organizerId, resolvedAt: null }, data: { pollIds } });
    if (crossed) {
      const alert = await tx.organizerAbsenceAlert.create({ data: { userId, organizerId, generation, groupName, pollIds } });
      const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "APPROVED", disabledAt: null }, select: { id: true } });
      for (const recipient of new Set([organizerId, ...admins.map((user) => user.id)])) {
        const preference = await tx.notificationPreference.findUnique({ where: { userId: recipient } });
        if (preference?.enabled === false) continue;
        const notification = await tx.notification.create({ data: { userId: recipient, groupId: contributions[0]!.poll.groupId,
          type: "ABSENCE_ALERT", title: "Seuil de trois absences atteint", body: "Un signalement nécessite votre vérification.",
          entityId: alert.id, sourceKey: `absence:${alert.id}`, expiresAt: new Date(Date.now() + 30 * 86400000) } });
        const subscriptions = await tx.pushSubscription.findMany({ where: { userId: recipient, session: { revokedAt: null, expiresAt: { gt: new Date() } } }, select: { id: true } });
        await tx.pushDelivery.createMany({ data: subscriptions.map((subscription) => ({ notificationId: notification.id, subscriptionId: subscription.id })), skipDuplicates: true });
      }
    }
  }
}
