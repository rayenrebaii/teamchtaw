import { TABLE_PAGE_SIZE } from "../common/pagination";
import { Prisma } from "@prisma/client";
import type { AnalyticsPeriod } from "./analytics.period";

// All timestamps written by Prisma are UTC timestamp-without-time-zone.
// A period is inclusive local calendar dates; SQL uses an exclusive next midnight.
export function attendanceCte(range: AnalyticsPeriod, page?: number) {
  const { from, to, timeZone, now, groupId } = range;
  return Prisma.sql`WITH bounds AS (
    SELECT (${from}::date::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC' AS lo,
      ((${to}::date + 1)::timestamp AT TIME ZONE ${timeZone}) AT TIME ZONE 'UTC' AS hi
  ), audience AS (
    SELECT "pollId", "groupId" FROM "PollGroup"
    UNION SELECT id, "groupId" FROM "Poll"
  ), selected_sessions AS (
    SELECT p.id, p.question, p."mandatoryAttendance", p."archivedAt", s."sessionAt"
    FROM "Poll" p
    JOIN LATERAL (
      SELECT min(o."startsAt") AS "sessionAt",
        bool_and(o."endsAt" IS NOT NULL AND o."endsAt" <= ${now}) AS finished
      FROM "PollOption" o WHERE o."pollId" = p.id HAVING count(*) > 0
    ) s ON s.finished
    CROSS JOIN bounds b
    WHERE p.type = 'SESSION' AND p.status <> 'CANCELLED'
      AND s."sessionAt" >= b.lo AND s."sessionAt" < b.hi
      AND (${groupId}::uuid IS NULL OR EXISTS (
        SELECT 1 FROM audience a WHERE a."pollId" = p.id AND a."groupId" = ${groupId}::uuid
      ))
  ), scoped_sessions AS (
    SELECT * FROM selected_sessions
    ${page === undefined ? Prisma.empty : Prisma.sql`ORDER BY "sessionAt" DESC, id LIMIT ${TABLE_PAGE_SIZE} OFFSET ${(page - 1) * TABLE_PAGE_SIZE}`}
  ), outcomes AS (
    SELECT sp."pollId", sp."userId", CASE
      WHEN EXISTS (SELECT 1 FROM "SessionMark" m JOIN "PollOption" o ON o.id = m."optionId" AND o."pollId" = m."pollId"
        WHERE m."pollId" = sp."pollId" AND m."userId" = sp."userId" AND m.attendance = 'PRESENT'
          AND (o."validatedAt" IS NOT NULL OR o."startsAt" <= coalesce(p."archivedAt", ${now}))) THEN 'PRESENT'
      WHEN sp."absenceConfirmedAt" IS NOT NULL THEN 'ABSENT' ELSE 'PENDING' END AS final
    FROM "SessionParticipant" sp JOIN scoped_sessions p ON p.id = sp."pollId"
    JOIN "User" u ON u.id = sp."userId" AND u.role = 'USER'
    WHERE p."mandatoryAttendance" AND sp.included
    UNION ALL
    SELECT v."pollId", v."userId", CASE
      WHEN bool_or(vo.attendance = 'PRESENT') THEN 'PRESENT'
      WHEN bool_and(vo.attendance = 'ABSENT') THEN 'ABSENT' ELSE 'PENDING' END AS final
    FROM "PollVote" v JOIN scoped_sessions p ON p.id = v."pollId"
    JOIN "User" u ON u.id = v."userId" AND u.role = 'USER'
    JOIN "PollVoteOption" vo ON vo."voteId" = v.id AND vo."pollId" = v."pollId"
    JOIN "PollOption" o ON o.id = vo."optionId" AND o."pollId" = vo."pollId"
    WHERE NOT p."mandatoryAttendance"
      AND (o."validatedAt" IS NOT NULL OR o."startsAt" <= coalesce(p."archivedAt", ${now}))
    GROUP BY v."pollId", v."userId"
  )`;
}

export function summarySql(range: AnalyticsPeriod) {
  return Prisma.sql`${attendanceCte(range)}, group_counts AS (
    SELECT a."groupId", count(*) FILTER (WHERE o.final = 'PRESENT')::int AS present,
      count(*) FILTER (WHERE o.final = 'ABSENT')::int AS absent,
      count(*) FILTER (WHERE o.final = 'PENDING')::int AS pending
    FROM outcomes o JOIN audience a ON a."pollId" = o."pollId" GROUP BY a."groupId"
  ) SELECT json_build_object(
    'sessions', (SELECT count(*)::int FROM selected_sessions),
    'present', (SELECT count(*)::int FROM outcomes WHERE final = 'PRESENT'),
    'absent', (SELECT count(*)::int FROM outcomes WHERE final = 'ABSENT'),
    'pending', (SELECT count(*)::int FROM outcomes WHERE final = 'PENDING'),
    'groups', (SELECT coalesce(json_agg(json_build_object('id', g.id, 'name', g.name,
      'members', (SELECT count(*)::int FROM "GroupMember" gm JOIN "User" u ON u.id = gm."userId" WHERE gm."groupId" = g.id AND u.role = 'USER'),
      'present', coalesce(c.present, 0), 'absent', coalesce(c.absent, 0), 'pending', coalesce(c.pending, 0)) ORDER BY g.name, g.id), '[]'::json)
      FROM "Group" g LEFT JOIN group_counts c ON c."groupId" = g.id)
  ) AS data`;
}

export function registrationsSql(range: AnalyticsPeriod) {
  const { from, to, timeZone, interval, groupId } = range;
  return Prisma.sql`WITH scoped_users AS (
    SELECT u.id, u.status, (u."joinedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timeZone}) AS created
    FROM "User" u WHERE NOT (u."isInvitedAdmin" AND u."disabledAt" IS NOT NULL)
      AND (${groupId}::uuid IS NULL OR EXISTS (SELECT 1 FROM "GroupMember" gm WHERE gm."userId" = u.id AND gm."groupId" = ${groupId}::uuid))
  ), buckets AS (
    SELECT generate_series(date_trunc(${interval}, ${from}::date::timestamp),
      date_trunc(${interval}, ${to}::date::timestamp), ('1 ' || ${interval})::interval) AS bucket
  ), counts AS (
    SELECT date_trunc(${interval}, created) AS bucket, count(*)::int AS n
    FROM scoped_users WHERE created >= ${from}::date AND created < ${to}::date + 1 GROUP BY 1
  ), series AS (
    SELECT b.bucket, coalesce(c.n, 0)::int AS n,
      ((SELECT count(*) FROM scoped_users WHERE created < ${from}::date)
        + sum(coalesce(c.n, 0)) OVER (ORDER BY b.bucket))::int AS cumulative
    FROM buckets b LEFT JOIN counts c ON c.bucket = b.bucket
  ) SELECT json_build_object(
    'users', (SELECT count(*)::int FROM scoped_users),
    'approved', (SELECT count(*)::int FROM scoped_users WHERE status = 'APPROVED'),
    'pending', (SELECT count(*)::int FROM scoped_users WHERE status = 'PENDING'),
    'series', (SELECT coalesce(json_agg(json_build_object(
      'from', to_char(greatest(bucket, ${from}::date), 'YYYY-MM-DD'),
      'to', to_char(least((bucket + ('1 ' || ${interval})::interval)::date - 1, ${to}::date), 'YYYY-MM-DD'),
      'count', n, 'cumulative', cumulative) ORDER BY bucket), '[]'::json) FROM series)
  ) AS data`;
}

export function sessionsSql(range: AnalyticsPeriod, page: number) {
  return Prisma.sql`${attendanceCte(range, page)}, items AS (
    SELECT p.id, p.question, p."sessionAt", count(o."userId") FILTER (WHERE o.final = 'PRESENT')::int AS present,
      count(o."userId") FILTER (WHERE o.final = 'ABSENT')::int AS absent,
      count(o."userId") FILTER (WHERE o.final = 'PENDING')::int AS pending,
      (SELECT json_agg(g.name ORDER BY g.name) FROM audience a JOIN "Group" g ON g.id = a."groupId" WHERE a."pollId" = p.id) AS groups
    FROM scoped_sessions p LEFT JOIN outcomes o ON o."pollId" = p.id GROUP BY p.id, p.question, p."sessionAt"
  ) SELECT json_build_object('total', (SELECT count(*)::int FROM selected_sessions),
    'items', (SELECT coalesce(json_agg(json_build_object('id', id, 'name', question,
      'date', to_char("sessionAt" AT TIME ZONE 'UTC' AT TIME ZONE ${range.timeZone}, 'YYYY-MM-DD'),
      'present', present, 'absent', absent, 'pending', pending, 'groups', groups)
      ORDER BY "sessionAt" DESC, id), '[]'::json) FROM items)) AS data`;
}

// Alerts use the existing organizer state and threshold lifecycle, independently of graph dates.
export function alertsSql(groupId: string | null, page: number) {
  return Prisma.sql`WITH active AS (
    SELECT a.id, a."userId", a."createdAt", a."pollIds", a."groupName", s.total,
      u."firstName" || ' ' || u."lastName" AS student,
      org."firstName" || ' ' || org."lastName" AS organizer
    FROM "OrganizerAbsenceAlert" a JOIN "OrganizerAbsenceState" s ON s."userId" = a."userId" AND s."organizerId" = a."organizerId"
    JOIN "User" u ON u.id = a."userId" JOIN "User" org ON org.id = a."organizerId"
    WHERE a."resolvedAt" IS NULL AND s.total >= 3
      AND (${groupId}::uuid IS NULL OR EXISTS (SELECT 1 FROM "PollGroup" pg WHERE pg."pollId" = ANY(a."pollIds") AND pg."groupId" = ${groupId}::uuid))
  ), paged AS (SELECT * FROM active ORDER BY "createdAt" DESC, id LIMIT ${TABLE_PAGE_SIZE} OFFSET ${(page - 1) * TABLE_PAGE_SIZE})
  SELECT json_build_object('total', (SELECT count(*)::int FROM active), 'items',
    (SELECT coalesce(json_agg(json_build_object('id', a.id, 'userId', a."userId", 'student', a.student,
      'organizer', a.organizer, 'absences', a.total, 'groups', coalesce((SELECT json_agg(g.name ORDER BY g.name)
        FROM "Group" g WHERE EXISTS (SELECT 1 FROM "PollGroup" pg WHERE pg."groupId" = g.id AND pg."pollId" = ANY(a."pollIds"))), json_build_array(a."groupName")))
      ORDER BY a."createdAt" DESC, a.id), '[]'::json) FROM paged a)) AS data`;
}
