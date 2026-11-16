BEGIN;
CREATE TABLE "PollGroup" (
  "pollId" UUID NOT NULL,
  "groupId" UUID NOT NULL,
  CONSTRAINT "PollGroup_pkey" PRIMARY KEY ("pollId", "groupId"),
  CONSTRAINT "PollGroup_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PollGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PollGroup_groupId_pollId_idx" ON "PollGroup"("groupId", "pollId");
INSERT INTO "PollGroup" ("pollId", "groupId") SELECT id, "groupId" FROM "Poll";
-- Preserve single-group writers while allowing a conversation card in each authorized group.
CREATE FUNCTION attach_primary_poll_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO "PollGroup" ("pollId", "groupId") VALUES (NEW.id, NEW."groupId") ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER "Poll_attach_primary_group" AFTER INSERT ON "Poll" FOR EACH ROW EXECUTE FUNCTION attach_primary_poll_group();
ALTER TABLE "Message" DROP CONSTRAINT "Message_poll_group_fkey";
ALTER TABLE "Message" ADD CONSTRAINT "Message_poll_group_fkey" FOREIGN KEY ("pollId", "groupId") REFERENCES "PollGroup" ("pollId", "groupId");
DROP INDEX "Message_pollId_key";
CREATE UNIQUE INDEX "Message_groupId_pollId_key" ON "Message"("groupId", "pollId");
-- Existing slots/capacities, votes, marks, participants and deadlines are untouched.
COMMIT;
