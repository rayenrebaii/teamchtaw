export function attendanceSlotStarted(startsAt: string | null | undefined, now = Date.now()) {
  const start = Date.parse(startsAt ?? "");
  return Number.isFinite(start) && start <= now;
}
