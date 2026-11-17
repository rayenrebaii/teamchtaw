import { BadRequestException, ConflictException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export function confirmedSlots(now: Date): Prisma.PollOptionWhereInput {
  return { OR: [{ validatedAt: { not: null } }, { startsAt: { lte: now }, poll: { status: { not: "CANCELLED" } } }] };
}

export function isConfirmedSlot(option: { startsAt: Date | null; validatedAt: Date | null }, now: Date, cancelled = false) {
  return option.validatedAt !== null || (!cancelled && option.startsAt !== null && option.startsAt <= now);
}

export function assertAttendanceStarted(option: { startsAt: Date | null } | undefined, now = new Date()) {
  if (!option) throw new BadRequestException("Créneau étranger à la séance.");
  if (!option.startsAt || option.startsAt > now)
    throw new ConflictException("Le pointage est disponible uniquement à partir de l’heure de début du créneau.");
}
