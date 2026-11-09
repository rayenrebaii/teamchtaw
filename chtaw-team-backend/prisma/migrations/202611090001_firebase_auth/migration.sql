-- Additive only. Existing identities, passwords, roles and business data remain intact.
ALTER TABLE "User" ADD COLUMN "firebaseUid" VARCHAR(128),
                   ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
ALTER TABLE "RefreshSession" ADD COLUMN "firebaseAuthTime" INTEGER;
