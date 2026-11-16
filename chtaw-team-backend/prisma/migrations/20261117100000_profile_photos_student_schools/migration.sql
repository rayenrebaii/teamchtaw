-- Additive: existing users keep NULL school/photo references. No invented values.
BEGIN;
CREATE TYPE "EstablishmentSuggestionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "EstablishmentSuggestion" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" VARCHAR(120) NOT NULL,
  "normalizedName" VARCHAR(120) NOT NULL,
  "status" "EstablishmentSuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "establishmentId" UUID,
  CONSTRAINT "EstablishmentSuggestion_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EstablishmentSuggestion_pending_name_key" ON "EstablishmentSuggestion"("normalizedName") WHERE "status" = 'PENDING';
CREATE INDEX "EstablishmentSuggestion_status_createdAt_idx" ON "EstablishmentSuggestion"("status", "createdAt");
-- Fail safely if historical official names collide after whitespace normalization;
-- never merge or delete existing establishments automatically.
CREATE UNIQUE INDEX "Establishment_normalized_name_key" ON "Establishment" (lower(regexp_replace(btrim("name"), '[[:space:]]+', ' ', 'g')));
ALTER TABLE "User" ADD COLUMN "profilePhotoId" UUID,
  ADD COLUMN "phone" VARCHAR(12),
  ADD COLUMN "establishmentId" UUID,
  ADD COLUMN "establishmentSuggestionId" UUID;
CREATE UNIQUE INDEX "User_profilePhotoId_key" ON "User"("profilePhotoId");
CREATE INDEX "User_establishmentId_idx" ON "User"("establishmentId");
CREATE INDEX "User_establishmentSuggestionId_idx" ON "User"("establishmentSuggestionId");
ALTER TABLE "User" ADD CONSTRAINT "User_establishmentId_fkey" FOREIGN KEY ("establishmentId") REFERENCES "Establishment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_establishmentSuggestionId_fkey" FOREIGN KEY ("establishmentSuggestionId") REFERENCES "EstablishmentSuggestion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_student_school_only" CHECK ("role" = 'USER' OR ("establishmentId" IS NULL AND "establishmentSuggestionId" IS NULL));
CREATE TABLE "ProfilePhotoCleanup" (
  "storageKey" VARCHAR(41) NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
COMMIT;
