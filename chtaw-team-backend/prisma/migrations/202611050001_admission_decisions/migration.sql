CREATE TABLE "AdmissionDecision" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "status" "AccountStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdmissionDecision_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdmissionDecision_status_final" CHECK ("status" IN ('APPROVED', 'REJECTED')),
  CONSTRAINT "AdmissionDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "AdmissionDecision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "AdmissionDecision_userId_createdAt_idx" ON "AdmissionDecision"("userId", "createdAt");
