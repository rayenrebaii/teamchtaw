import { BadRequestException, ConflictException } from "@nestjs/common";

export function assertAttendanceStarted(option: { startsAt: Date | null; validatedAt: Date | null } | undefined, now = new Date()) {
  if (!option) throw new BadRequestException("Créneau étranger à la séance.");
  if (!option.validatedAt) throw new ConflictException("Ce créneau doit être validé avant le pointage.");
  if (!option.startsAt || option.startsAt > now)
    throw new ConflictException("Le pointage est disponible uniquement à partir de l’heure de début du créneau.");
}
