-- One permanent general group. Public APIs never accept isGeneral.
CREATE UNIQUE INDEX "Group_single_general" ON "Group" ("isGeneral") WHERE "isGeneral" = true;
CREATE FUNCTION protect_general_group() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  IF OLD."isGeneral" THEN RAISE EXCEPTION 'General group is permanent' USING ERRCODE = '23514'; END IF;
  RETURN OLD;
 END IF;
 IF OLD."isGeneral" IS DISTINCT FROM NEW."isGeneral" THEN RAISE EXCEPTION 'General flag is immutable' USING ERRCODE = '23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Group_protect_general" BEFORE UPDATE OR DELETE ON "Group" FOR EACH ROW EXECUTE FUNCTION protect_general_group();
ALTER TABLE "User" ADD CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")));
ALTER TABLE "Media" ADD CONSTRAINT "Media_dimensions_size" CHECK ("size" > 0 AND "width" > 0 AND "height" > 0);
ALTER TABLE "Message" ADD CONSTRAINT "Message_payload_kind" CHECK (
 (kind = 'text' AND length(btrim(text)) > 0 AND "mediaId" IS NULL AND "pollId" IS NULL) OR
 (kind = 'photo' AND "mediaId" IS NOT NULL AND "pollId" IS NULL) OR
 (kind = 'poll' AND "pollId" IS NOT NULL AND "mediaId" IS NULL) OR
 (kind = 'system' AND "mediaId" IS NULL AND "pollId" IS NULL)
);
-- Composite FKs ensure media and polls cannot be attached to another group's message.
CREATE UNIQUE INDEX "Media_id_groupId_key" ON "Media" (id,"groupId");
CREATE UNIQUE INDEX "Poll_id_groupId_key" ON "Poll" (id,"groupId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_media_group_fkey" FOREIGN KEY ("mediaId","groupId") REFERENCES "Media" (id,"groupId");
ALTER TABLE "Message" ADD CONSTRAINT "Message_poll_group_fkey" FOREIGN KEY ("pollId","groupId") REFERENCES "Poll" (id,"groupId");
