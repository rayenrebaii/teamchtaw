-- Attendance remains authoritative after a completed session leaves the active lists.
ALTER TABLE "Poll" ADD COLUMN "archivedAt" TIMESTAMP(3);
CREATE INDEX "Poll_archivedAt_type_createdAt_idx" ON "Poll"("archivedAt", "type", "createdAt");
