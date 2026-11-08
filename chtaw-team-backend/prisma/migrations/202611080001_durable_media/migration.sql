CREATE TABLE "StoredMedia" (
  "key" VARCHAR(41) PRIMARY KEY,
  "content" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredMedia_key_check" CHECK ("key" ~ '^[0-9a-f-]{36}\.webp$'),
  CONSTRAINT "StoredMedia_size_check" CHECK (octet_length("content") BETWEEN 1 AND 10485760)
);
