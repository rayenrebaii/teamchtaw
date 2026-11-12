CREATE TYPE "GroupJoinStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "GroupJoinRequest" (
    "id" UUID NOT NULL,
    "groupId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "GroupJoinStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" UUID,
    CONSTRAINT "GroupJoinRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GroupJoinRequest_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GroupJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GroupJoinRequest_groupId_userId_key" ON "GroupJoinRequest"("groupId", "userId");
CREATE INDEX "GroupJoinRequest_status_createdAt_id_idx" ON "GroupJoinRequest"("status", "createdAt", "id");

