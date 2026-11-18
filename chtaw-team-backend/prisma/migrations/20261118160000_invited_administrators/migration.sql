-- Existing administrators remain protected. Only the invitation service sets this flag.
ALTER TABLE "User" ADD COLUMN "isInvitedAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "principalAdminId" UUID;
ALTER TABLE "User" ADD CONSTRAINT "User_principalAdminId_fkey"
  FOREIGN KEY ("principalAdminId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_invited_admin_role_check"
  CHECK (("isInvitedAdmin" AND role = 'ADMIN' AND "principalAdminId" IS NOT NULL AND "principalAdminId" <> id)
    OR (NOT "isInvitedAdmin" AND "principalAdminId" IS NULL));
