import { ConflictException } from "@nestjs/common";

// This restriction applies to cancellation and schedule edits, never to explicit deletion.
export function assertSessionCancellationAllowed(options: { startsAt: Date | null }[], now = new Date()) {
  const starts = options.map((option) => option.startsAt?.getTime());
  if (!starts.length || starts.some((start) => start === undefined || !Number.isFinite(start)) ||
      now.getTime() > Math.min(...starts as number[]) - 2 * 3600000)
    throw new ConflictException("Annulation ou modification des horaires impossible moins de deux heures avant le premier créneau.");
}
