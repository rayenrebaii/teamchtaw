import { BadRequestException, ConflictException } from "@nestjs/common";

export function assertAttendanceStarted(option: { startsAt: Date | null } | undefined, now = new Date()) {
  if (!option) throw new BadRequestException("Créneau étranger à la séance.");
  if (!option.startsAt || option.startsAt > now)
    throw new ConflictException("Le pointage est disponible uniquement à partir de l’heure de début du créneau.");
}
