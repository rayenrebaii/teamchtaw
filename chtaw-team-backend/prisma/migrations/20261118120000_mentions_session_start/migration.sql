BEGIN;
ALTER TABLE "Message" ADD COLUMN "mentionIds" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_type_check";
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_type_check"
  CHECK (type IN ('MESSAGE','MENTION','POLL','SESSION_24H','SESSION_1H','SESSION_START','ABSENCE_ALERT'));
ALTER TABLE "SessionReminderDelivery" DROP CONSTRAINT "SessionReminderDelivery_reminderType_check";
ALTER TABLE "SessionReminderDelivery" ADD CONSTRAINT "SessionReminderDelivery_reminderType_check"
  CHECK ("reminderType" IN ('SESSION_24H','SESSION_1H','SESSION_START'));
COMMIT;
