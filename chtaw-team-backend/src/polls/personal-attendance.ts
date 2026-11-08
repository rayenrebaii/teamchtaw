export type PersonalStatus = "UPCOMING" | "PRESENT" | "ABSENT" | "PENDING" | "CANCELLED";
export interface PersonalSession {
  id: string;
  question: string;
  groupId: string;
  groupName: string;
  description: string;
  status: string;
  final: string;
  mandatoryAttendance: boolean;
  currentMember?: boolean;
  slots: { optionId: string; label: string; startsAt: Date | null; endsAt: Date | null }[];
  selections: { optionId: string }[];
}
export interface PersonalQuery {
  pollId?: string;
  from?: string;
  to?: string;
  status?: PersonalStatus;
  groupId?: string;
  order: "recommended" | "asc" | "desc";
  page: number;
  limit: number;
  timeZone: string;
}
export function personalAttendance(
  sessions: PersonalSession[],
  query: PersonalQuery,
  now = new Date(),
) {
  const dateFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: query.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (date: Date) => {
    const parts = dateFormat.formatToParts(date);
    return ["year", "month", "day"]
      .map((type) => parts.find((part) => part.type === type)!.value)
      .join("-");
  };
  const unique = [...new Map(sessions.map((session) => [session.id, session])).values()].filter(
    (session) => session.final !== "NON_CONCERNE",
  );
  const items = unique
    .map((session) => {
      const chosen = new Set(session.selections.map((selection) => selection.optionId));
      const slots = session.slots
        .filter((slot) => session.mandatoryAttendance || !chosen.size || chosen.has(slot.optionId))
        .sort(
          (first, second) =>
            (first.startsAt?.getTime() ?? Infinity) - (second.startsAt?.getTime() ?? Infinity),
        );
      const dates = slots.flatMap((slot) => (slot.startsAt ? [slot.startsAt] : []));
      const startsAt = dates[0] ?? null;
      const ends = slots.flatMap((slot) => (slot.endsAt ? [slot.endsAt] : []));
      const endsAt =
        ends.length === slots.length && slots.length > 0
          ? new Date(Math.max(...ends.map((date) => date.getTime())))
          : null;
      const scheduleComplete = slots.length > 0 && dates.length === slots.length;
      const future = scheduleComplete && startsAt !== null && startsAt > now;
      const cancelled = session.status === "CANCELLED" || session.final === "ANNULE";
      const status: PersonalStatus = cancelled
        ? "CANCELLED"
        : future
          ? "UPCOMING"
          : session.final === "PRESENT"
            ? "PRESENT"
            : session.final === "ABSENT"
              ? "ABSENT"
              : "PENDING";
      return {
        ...session,
        slots,
        startsAt,
        endsAt,
        scheduleComplete,
        completed: !cancelled && scheduleComplete && endsAt !== null && endsAt <= now,
        attendanceStatus: status,
      };
    })
    .filter(
      (item) => item.currentMember !== false || (item.startsAt !== null && item.startsAt <= now),
    );
  const stats = {
    completed: items.filter((item) => item.completed).length,
    present: items.filter((item) => item.attendanceStatus === "PRESENT").length,
    absent: items.filter((item) => item.attendanceStatus === "ABSENT").length,
    upcoming: items.filter((item) => item.attendanceStatus === "UPCOMING").length,
  };
  const groups = [
    ...new Map(
      items.map((item) => [item.groupId, { id: item.groupId, name: item.groupName }]),
    ).values(),
  ];
  const filtered = items
    .filter(
      (item) =>
        (!query.pollId || item.id === query.pollId) &&
        (!query.status || item.attendanceStatus === query.status) &&
        (!query.groupId || item.groupId === query.groupId) &&
        ((!query.from && !query.to) ||
          item.slots.some(
            (slot) =>
              slot.startsAt &&
              (!query.from || day(slot.startsAt) >= query.from) &&
              (!query.to || day(slot.startsAt) <= query.to),
          )),
    )
    .sort((first, second) => {
      const firstDate = first.startsAt?.getTime();
      const secondDate = second.startsAt?.getTime();
      if (firstDate === undefined)
        return secondDate === undefined ? first.id.localeCompare(second.id) : 1;
      if (secondDate === undefined) return -1;
      if (query.order === "recommended") {
        const firstFuture = first.attendanceStatus === "UPCOMING",
          secondFuture = second.attendanceStatus === "UPCOMING";
        if (firstFuture !== secondFuture) return firstFuture ? -1 : 1;
        return (
          (firstFuture ? firstDate - secondDate : secondDate - firstDate) ||
          first.id.localeCompare(second.id)
        );
      }
      return (
        (query.order === "asc" ? firstDate - secondDate : secondDate - firstDate) ||
        first.id.localeCompare(second.id)
      );
    });
  return {
    items: filtered.slice((query.page - 1) * query.limit, query.page * query.limit),
    total: filtered.length,
    stats,
    groups,
    page: query.page,
    limit: query.limit,
    timeZone: query.timeZone,
    incompleteSchedules: items.some((item) => !item.scheduleComplete || !item.endsAt),
  };
}
