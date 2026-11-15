-- Non-destructive: historical capacities are unknown, never guessed.
ALTER TABLE "PollOption" ADD COLUMN "capacity" INTEGER;
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);
-- Preserve historical ballots and attendance schedules. New API writes enforce one choice,
-- 90 minutes and no deadline. Historical multiple ballots are read-only until reviewed.
