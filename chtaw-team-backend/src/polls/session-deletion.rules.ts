import { ConflictException } from "@nestjs/common";
import { finalAttendance } from "./attendance.rules";
import { mandatoryFinal, sessionFinished } from "./attendance.reconcile";

interface SessionLifecycle {
  type: string;
  mandatoryAttendance: boolean;
  attendanceLockedAt: Date | null;
  options: { startsAt: Date | null; endsAt: Date | null }[];
  participants: { included: boolean; absenceConfirmedAt: Date | null; marks: { attendance: string }[] }[];
  votes: { options: { attendance: string }[] }[];
}

export function assertSessionCancellationAllowed(options: SessionLifecycle["options"], now = new Date()) {
  const starts = options.map((option) => option.startsAt?.getTime());
  if (!starts.length || starts.some((start) => start === undefined || !Number.isFinite(start)) ||
      now.getTime() > Math.min(...starts as number[]) - 2 * 3600000)
    throw new ConflictException("Annulation ou modification des horaires impossible moins de deux heures avant le premier créneau.");
}

// The last slot must have ended. One saved mark is never proof of a complete roster.
export function sessionDeletionMode(poll: SessionLifecycle, now = new Date()): "DELETE" | "ARCHIVE" {
  if (poll.type !== "SESSION") return "DELETE";
  if (!poll.attendanceLockedAt) {
    try { assertSessionCancellationAllowed(poll.options, now); return "DELETE"; }
    catch { /* After the cancellation window closes, completed attendance is required. */ }
  }
  if (!sessionFinished(poll.options, now))
    throw new ConflictException("Suppression bloquée : attendez la fin de tous les créneaux de la séance et validez toutes les présences.");
  const finals = poll.mandatoryAttendance
    ? poll.participants.filter((person) => person.included).map(mandatoryFinal)
    : poll.votes.map((vote) => finalAttendance(vote.options.map((option) => option.attendance)));
  if (!poll.attendanceLockedAt || finals.some((final) => final !== "PRESENT" && final !== "ABSENT"))
    throw new ConflictException("Suppression bloquée : enregistrez et validez les présences de tous les étudiants concernés.");
  return "ARCHIVE";
}
