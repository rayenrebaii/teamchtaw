-- Independent reference data; no existing table or business row is changed.
CREATE TABLE "Establishment" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    CONSTRAINT "Establishment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Establishment_name_trimmed_nonempty" CHECK (
        "name" = btrim("name") AND char_length("name") > 0
    )
);

-- An expression index avoids an additional business/normalization column.
CREATE UNIQUE INDEX "Establishment_name_case_insensitive_key"
    ON "Establishment" (lower("name"));
