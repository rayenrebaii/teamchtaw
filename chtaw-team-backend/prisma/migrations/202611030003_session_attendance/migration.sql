-- Additive migration: historical polls and votes retain ordinary-poll behavior.
CREATE TYPE "PollType" AS ENUM ('ORDINARY', 'SESSION');
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "AttendanceStatus" AS ENUM ('NON_VERIFIE', 'PRESENT', 'ABSENT');
ALTER TABLE "Poll" ADD COLUMN "description" VARCHAR(2000) NOT NULL DEFAULT '',
 ADD COLUMN "type" "PollType" NOT NULL DEFAULT 'ORDINARY',
 ADD COLUMN "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
 ADD COLUMN "attendanceLockedAt" TIMESTAMP(3);
ALTER TABLE "PollOption" ADD COLUMN "startsAt" TIMESTAMP(3);
ALTER TABLE "PollVoteOption" ADD COLUMN "attendance" "AttendanceStatus" NOT NULL DEFAULT 'NON_VERIFIE',
 ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "AttendanceEdit" (
 "id" UUID PRIMARY KEY, "voteId" UUID NOT NULL, "optionId" UUID NOT NULL,
 "actorId" UUID NOT NULL, "before" "AttendanceStatus" NOT NULL, "after" "AttendanceStatus" NOT NULL,
 "version" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AttendanceEdit_selection_fkey" FOREIGN KEY ("voteId","optionId") REFERENCES "PollVoteOption" ("voteId","optionId") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "AttendanceEdit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" (id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AttendanceEdit_voteId_optionId_version_key" ON "AttendanceEdit" ("voteId","optionId","version");
CREATE INDEX "AttendanceEdit_voteId_createdAt_idx" ON "AttendanceEdit" ("voteId","createdAt");
CREATE TABLE "AbsenceState" (
 "userId" UUID PRIMARY KEY REFERENCES "User" (id) ON DELETE CASCADE ON UPDATE CASCADE,
 "total" INTEGER NOT NULL DEFAULT 0, "generation" INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE "AbsenceAlert" (
 "id" UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User" (id) ON DELETE CASCADE ON UPDATE CASCADE,
 "generation" INTEGER NOT NULL, "groupName" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "readAt" TIMESTAMP(3), "resolvedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AbsenceAlert_userId_generation_key" ON "AbsenceAlert" ("userId","generation");
CREATE INDEX "AbsenceAlert_resolvedAt_readAt_createdAt_idx" ON "AbsenceAlert" ("resolvedAt","readAt","createdAt");
CREATE INDEX "Poll_type_status_createdAt_idx" ON "Poll" ("type","status","createdAt");
