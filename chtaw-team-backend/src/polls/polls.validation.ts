import { BadRequestException } from "@nestjs/common";
import { CreatePollDto } from "./polls.dto";
export function validateSessionOverlap(startsAt: string[]) {
  const starts = startsAt.map(Date.parse).sort((a, b) => a - b);
  if (starts.some((start, index) => index > 0 && start < starts[index - 1]! + 90 * 60000))
    throw new BadRequestException("Les créneaux d’une même séance ne doivent pas se chevaucher.");
}
export function validatePoll(dto: CreatePollDto, editing = false) {
  const session = dto.type === "SESSION";
  if (
    !dto.options.length ||
    dto.options.length > (session ? 100 : 8) ||
    (!session && dto.options.length < 2)
  )
    throw new BadRequestException("Nombre de réponses invalide.");
  if (new Set(dto.options.map((o) => o.trim().toLocaleLowerCase())).size !== dto.options.length)
    throw new BadRequestException("Les réponses doivent être différentes.");
  if (!session && !editing && dto.endsAt && new Date(dto.endsAt) <= new Date())
    throw new BadRequestException("La clôture doit être dans le futur.");
  if (session) {
    if (!dto.startsAt || dto.startsAt.length !== dto.options.length ||
        dto.startsAt.some((value) => !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) ||
        new Set(dto.startsAt.map(Date.parse)).size !== dto.startsAt.length)
      throw new BadRequestException("Chaque créneau exige une date ISO avec fuseau, distincte et valide.");
    if (!dto.capacities || dto.capacities.length !== dto.options.length ||
        dto.capacities.some((value) => !Number.isSafeInteger(value) || value <= 0 || value > 2147483647))
      throw new BadRequestException("Chaque créneau exige une capacité entière strictement positive.");
    if (!editing && dto.startsAt.some((value) => Date.parse(value) <= Date.now()))
      throw new BadRequestException("Les créneaux doivent être dans le futur.");
    dto.singleChoice = true;
    dto.endsAt = undefined;
    dto.slotEndsAt = dto.startsAt.map((start) => new Date(Date.parse(start) + 90 * 60000).toISOString());
    if (!editing) validateSessionOverlap(dto.startsAt);
  } else if (dto.startsAt?.length) throw new BadRequestException("Horaires réservés aux séances.");
}
