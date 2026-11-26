CREATE TABLE "ContactRequest" (
  "id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL,
  "subject" VARCHAR(20) NOT NULL CHECK ("subject" IN ('registration', 'approval', 'login', 'sessions', 'other')),
  "message" VARCHAR(5000) NOT NULL,
  "status" VARCHAR(12) NOT NULL DEFAULT 'NEW' CHECK ("status" IN ('NEW', 'PROCESSED')),
  "senderHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "ContactRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContactRequest_createdAt_id_idx" ON "ContactRequest"("createdAt", "id");
CREATE INDEX "ContactRequest_senderHash_createdAt_idx" ON "ContactRequest"("senderHash", "createdAt");
