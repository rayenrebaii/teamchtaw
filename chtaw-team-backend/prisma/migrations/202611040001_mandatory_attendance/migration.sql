-- Additive only. Keep custom cross-group foreign keys and all legacy attendance rows.
BEGIN;

-- AlterTable
ALTER TABLE "Poll" ADD COLUMN     "mandatoryAttendance" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PollOption" ADD COLUMN     "endsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SessionParticipant" (
    "pollId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "absenceConfirmedAt" TIMESTAMP(3),
    "reportOpenedAt" TIMESTAMP(3),
    "reportResolvedAt" TIMESTAMP(3),

    CONSTRAINT "SessionParticipant_pkey" PRIMARY KEY ("pollId","userId")
);

-- CreateTable
CREATE TABLE "SessionMark" (
    "pollId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "attendance" "AttendanceStatus" NOT NULL DEFAULT 'NON_VERIFIE',
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SessionMark_pkey" PRIMARY KEY ("pollId","userId","optionId")
);

-- CreateTable
CREATE TABLE "SessionAttendanceEdit" (
    "id" UUID NOT NULL,
    "pollId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "optionId" UUID,
    "action" VARCHAR(32) NOT NULL,
    "before" VARCHAR(32) NOT NULL,
    "after" VARCHAR(32) NOT NULL,
    "version" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAttendanceEdit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionParticipant_userId_included_idx" ON "SessionParticipant"("userId", "included");

-- CreateIndex
CREATE INDEX "SessionParticipant_reportResolvedAt_reportOpenedAt_idx" ON "SessionParticipant"("reportResolvedAt", "reportOpenedAt");

-- CreateIndex
CREATE INDEX "SessionMark_optionId_pollId_idx" ON "SessionMark"("optionId", "pollId");

-- CreateIndex
CREATE INDEX "SessionAttendanceEdit_pollId_userId_createdAt_idx" ON "SessionAttendanceEdit"("pollId", "userId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMark" ADD CONSTRAINT "SessionMark_pollId_userId_fkey" FOREIGN KEY ("pollId", "userId") REFERENCES "SessionParticipant"("pollId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionMark" ADD CONSTRAINT "SessionMark_optionId_pollId_fkey" FOREIGN KEY ("optionId", "pollId") REFERENCES "PollOption"("id", "pollId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAttendanceEdit" ADD CONSTRAINT "SessionAttendanceEdit_pollId_userId_fkey" FOREIGN KEY ("pollId", "userId") REFERENCES "SessionParticipant"("pollId", "userId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAttendanceEdit" ADD CONSTRAINT "SessionAttendanceEdit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_end_after_start" CHECK ("endsAt" IS NULL OR ("startsAt" IS NOT NULL AND "endsAt" > "startsAt"));
ALTER TABLE "SessionParticipant" ADD CONSTRAINT "SessionParticipant_version_nonnegative" CHECK ("version" >= 0);
ALTER TABLE "SessionMark" ADD CONSTRAINT "SessionMark_version_nonnegative" CHECK ("version" >= 0);
COMMIT;
