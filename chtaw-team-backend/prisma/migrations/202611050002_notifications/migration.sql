BEGIN;
ALTER TABLE "PollOption" ADD COLUMN "notificationUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "NotificationPreference" (
 "userId" UUID PRIMARY KEY REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT true, "messagesEnabled" BOOLEAN NOT NULL DEFAULT true,
 "pollsEnabled" BOOLEAN NOT NULL DEFAULT true, "sessionRemindersEnabled" BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE "NotificationEvent" (
 "messageId" UUID PRIMARY KEY REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "recipientIds" UUID[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "processedAt" TIMESTAMP(3)
);
CREATE INDEX "NotificationEvent_processedAt_createdAt_idx" ON "NotificationEvent"("processedAt","createdAt");
CREATE TABLE "Notification" (
 id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "groupId" UUID NOT NULL REFERENCES "Group"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 type VARCHAR(32) NOT NULL CHECK(type IN ('MESSAGE','POLL','SESSION_24H','SESSION_1H')),
 title VARCHAR(200) NOT NULL, body VARCHAR(500) NOT NULL, "entityId" UUID NOT NULL, "optionId" UUID,
 "sourceKey" VARCHAR(250) NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "readAt" TIMESTAMP(3), "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "Notification_userId_sourceKey_key" ON "Notification"("userId","sourceKey");
CREATE INDEX "Notification_userId_readAt_createdAt_id_idx" ON "Notification"("userId","readAt","createdAt",id);
CREATE TABLE "PushSubscription" (
 id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "sessionId" UUID NOT NULL REFERENCES "RefreshSession"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "endpointHash" VARCHAR(64) NOT NULL UNIQUE, endpoint VARCHAR(2048) NOT NULL, p256dh VARCHAR(150) NOT NULL, auth VARCHAR(100) NOT NULL,
 binding UUID NOT NULL, language VARCHAR(2) NOT NULL DEFAULT 'fr' CHECK(language IN ('fr','en')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "PushSubscription_userId_sessionId_idx" ON "PushSubscription"("userId","sessionId");
CREATE TABLE "PushDelivery" (
 id UUID PRIMARY KEY, "notificationId" UUID NOT NULL REFERENCES "Notification"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "subscriptionId" UUID NOT NULL REFERENCES "PushSubscription"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','FAILED','SKIPPED')),
 attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0), "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leaseUntil" TIMESTAMP(3), "sentAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PushDelivery_notificationId_subscriptionId_key" ON "PushDelivery"("notificationId","subscriptionId");
CREATE INDEX "PushDelivery_status_nextAttemptAt_leaseUntil_idx" ON "PushDelivery"(status,"nextAttemptAt","leaseUntil");
CREATE TABLE "SessionReminderDelivery" (
 id UUID PRIMARY KEY, "sessionId" UUID NOT NULL REFERENCES "Poll"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "optionId" UUID NOT NULL, "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "reminderType" VARCHAR(16) NOT NULL CHECK("reminderType" IN ('SESSION_24H','SESSION_1H')),
 "startsAt" TIMESTAMP(3) NOT NULL, "scheduledFor" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3),
 status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','CANCELLED','SKIPPED'))
);
CREATE UNIQUE INDEX "SessionReminderDelivery_optionId_userId_reminderType_startsAt_key" ON "SessionReminderDelivery"("optionId","userId","reminderType","startsAt");
CREATE INDEX "SessionReminderDelivery_status_scheduledFor_idx" ON "SessionReminderDelivery"(status,"scheduledFor");
CREATE FUNCTION queue_notification_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.kind IN ('text','photo','poll') THEN
  INSERT INTO "NotificationEvent"("messageId","recipientIds")
  SELECT NEW.id, ARRAY(
   SELECT gm."userId" FROM "GroupMember" gm JOIN "User" u ON u.id=gm."userId"
   LEFT JOIN "NotificationPreference" pref ON pref."userId"=u.id
   WHERE gm."groupId"=NEW."groupId" AND u.id<>NEW."authorId" AND u.status='APPROVED'
    AND COALESCE(pref.enabled,true) AND CASE WHEN NEW.kind='poll' THEN COALESCE(pref."pollsEnabled",true) ELSE COALESCE(pref."messagesEnabled",true) END
  ) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "Message_notification_outbox" AFTER INSERT ON "Message" FOR EACH ROW EXECUTE FUNCTION queue_notification_event();
CREATE FUNCTION notification_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM pg_notify('chtaw_notifications', NEW."userId"::text);
 RETURN NEW;
END $$;
CREATE TRIGGER "Notification_changed" AFTER INSERT OR UPDATE ON "Notification" FOR EACH ROW EXECUTE FUNCTION notification_changed();
CREATE FUNCTION notification_schedule_changed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD."startsAt" IS DISTINCT FROM NEW."startsAt" OR OLD."endsAt" IS DISTINCT FROM NEW."endsAt" THEN NEW."notificationUpdatedAt"=CURRENT_TIMESTAMP; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER "PollOption_notification_schedule" BEFORE UPDATE ON "PollOption" FOR EACH ROW EXECUTE FUNCTION notification_schedule_changed();
COMMIT;
