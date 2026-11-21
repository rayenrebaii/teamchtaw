CREATE TABLE "FirebaseAccountDeletion" (
  "firebaseUid" VARCHAR(128) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "FirebaseAccountDeletion_pkey" PRIMARY KEY ("firebaseUid")
);
CREATE INDEX "FirebaseAccountDeletion_completedAt_nextAttemptAt_idx" ON "FirebaseAccountDeletion"("completedAt", "nextAttemptAt");
