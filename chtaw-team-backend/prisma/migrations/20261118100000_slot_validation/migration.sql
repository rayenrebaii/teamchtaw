ALTER TABLE "PollOption" ADD COLUMN "validatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
-- Existing sessions remain planned and retain their attendance history.
UPDATE "PollOption" o SET "validatedAt" = p."createdAt" FROM "Poll" p WHERE p.id = o."pollId" AND p.type = 'SESSION';
