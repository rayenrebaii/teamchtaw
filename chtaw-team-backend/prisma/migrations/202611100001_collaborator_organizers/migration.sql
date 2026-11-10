-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'COLLABORATOR';

-- Extend the existing database invariant for organizer threshold notifications.
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_type_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check"
CHECK (type IN ('MESSAGE','POLL','SESSION_24H','SESSION_1H','ABSENCE_ALERT'));

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "disabledAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AccountLink" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "purpose" VARCHAR(16) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerAbsenceState" (
    "userId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    "generation" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OrganizerAbsenceState_pkey" PRIMARY KEY ("userId","organizerId")
);

-- CreateTable
CREATE TABLE "OrganizerAbsenceAlert" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "generation" INTEGER NOT NULL,
    "groupName" TEXT NOT NULL,
    "pollIds" UUID[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "OrganizerAbsenceAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccountLink_tokenHash_key" ON "AccountLink"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountLink_userId_purpose_createdAt_idx" ON "AccountLink"("userId", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "OrganizerAbsenceState_organizerId_total_idx" ON "OrganizerAbsenceState"("organizerId", "total");

-- CreateIndex
CREATE INDEX "OrganizerAbsenceAlert_organizerId_resolvedAt_createdAt_idx" ON "OrganizerAbsenceAlert"("organizerId", "resolvedAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerAbsenceAlert_userId_organizerId_generation_key" ON "OrganizerAbsenceAlert"("userId", "organizerId", "generation");

-- CreateIndex
CREATE INDEX "Poll_authorId_type_createdAt_idx" ON "Poll"("authorId", "type", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountLink" ADD CONSTRAINT "AccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAbsenceState" ADD CONSTRAINT "OrganizerAbsenceState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAbsenceState" ADD CONSTRAINT "OrganizerAbsenceState_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAbsenceAlert" ADD CONSTRAINT "OrganizerAbsenceAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerAbsenceAlert" ADD CONSTRAINT "OrganizerAbsenceAlert_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Deterministic historical attribution: the immutable existing Poll.authorId.
-- No existing attendance, votes, alerts or users are changed.
WITH contributions AS (
 SELECT v."userId", p."authorId" AS "organizerId", p.id AS "pollId"
 FROM "PollVote" v JOIN "Poll" p ON p.id=v."pollId"
 WHERE p.type='SESSION' AND NOT p."mandatoryAttendance" AND p.status<>'CANCELLED'
 AND EXISTS (SELECT 1 FROM "PollVoteOption" o WHERE o."voteId"=v.id)
 AND NOT EXISTS (SELECT 1 FROM "PollVoteOption" o WHERE o."voteId"=v.id AND o.attendance<>'ABSENT')
 UNION
 SELECT s."userId", p."authorId", p.id
 FROM "SessionParticipant" s JOIN "Poll" p ON p.id=s."pollId"
 WHERE s.included AND s."absenceConfirmedAt" IS NOT NULL AND p.status<>'CANCELLED'
 AND NOT EXISTS (SELECT 1 FROM "SessionMark" m WHERE m."pollId"=s."pollId" AND m."userId"=s."userId" AND m.attendance='PRESENT')
), totals AS (
 SELECT "userId", "organizerId", count(*)::integer AS total FROM contributions GROUP BY 1,2
)
INSERT INTO "OrganizerAbsenceState" ("userId","organizerId",total,generation)
SELECT "userId","organizerId",total,CASE WHEN total>=3 THEN 1 ELSE 0 END FROM totals;

INSERT INTO "OrganizerAbsenceAlert" (id,"userId","organizerId",generation,"groupName","pollIds","createdAt")
SELECT gen_random_uuid(), s."userId",s."organizerId",1,'Historique vérifié',
 ARRAY(SELECT p.id FROM "Poll" p WHERE p."authorId"=s."organizerId" AND p.status<>'CANCELLED' AND p.type='SESSION' AND (
 (NOT p."mandatoryAttendance" AND EXISTS (SELECT 1 FROM "PollVote" v WHERE v."pollId"=p.id AND v."userId"=s."userId"
 AND EXISTS (SELECT 1 FROM "PollVoteOption" o WHERE o."voteId"=v.id)
 AND NOT EXISTS (SELECT 1 FROM "PollVoteOption" o WHERE o."voteId"=v.id AND o.attendance<>'ABSENT')))
 OR (p."mandatoryAttendance" AND EXISTS (SELECT 1 FROM "SessionParticipant" a WHERE a."pollId"=p.id AND a."userId"=s."userId"
 AND a.included AND a."absenceConfirmedAt" IS NOT NULL
 AND NOT EXISTS (SELECT 1 FROM "SessionMark" m WHERE m."pollId"=p.id AND m."userId"=s."userId" AND m.attendance='PRESENT')))
 ) ORDER BY p.id),CURRENT_TIMESTAMP
FROM "OrganizerAbsenceState" s WHERE s.total>=3;
