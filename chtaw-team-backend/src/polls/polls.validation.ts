import { BadRequestException } from "@nestjs/common";
import { CreatePollDto } from "./polls.dto";
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
  if (!editing && dto.endsAt && new Date(dto.endsAt) <= new Date())
    throw new BadRequestException("La clôture doit être dans le futur.");
  if (session) {
    if (
      (dto.mandatoryAttendance !== false || dto.slotEndsAt !== undefined) &&
      (!dto.slotEndsAt ||
        dto.slotEndsAt.length !== dto.options.length ||
        dto.slotEndsAt.some(
          (end, i) => !dto.startsAt?.[i] || new Date(end) <= new Date(dto.startsAt[i]!),
        ))
    )
      throw new BadRequestException(
        "Chaque heure de fin fournie doit correspondre à un créneau et être postérieure à son début.",
      );
    if (
      !dto.endsAt ||
      !dto.startsAt ||
      dto.startsAt.length !== dto.options.length ||
      dto.singleChoice
    )
      throw new BadRequestException(
        "Une séance exige une clôture, un horaire par option et le choix multiple.",
      );
    if (
      new Set(dto.startsAt.map((value) => new Date(value).getTime())).size !==
        dto.startsAt.length ||
      dto.startsAt.some((value) => new Date(value) <= new Date(dto.endsAt!))
    )
      throw new BadRequestException(
        "Les horaires doivent être distincts et postérieurs à la clôture du vote.",
      );
    if (dto.slotEndsAt) {
      const slots = dto.startsAt.map((start, index) => ({ start: Date.parse(start), end: Date.parse(dto.slotEndsAt![index]!) }))
        .sort((a, b) => a.start - b.start);
      if (slots.some((slot, index) => index > 0 && slot.start < slots[index - 1]!.end))
        throw new BadRequestException("Les créneaux d’une même séance ne doivent pas se chevaucher.");
    }
  } else if (dto.startsAt?.length) throw new BadRequestException("Horaires réservés aux séances.");
}
