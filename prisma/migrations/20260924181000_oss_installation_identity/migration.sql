CREATE TABLE "oss_installation_identity" (
    "key" VARCHAR(32) NOT NULL,
    "installation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "oss_installation_identity_pkey" PRIMARY KEY ("key")
);

CREATE UNIQUE INDEX "oss_installation_identity_installation_id_key" ON "oss_installation_identity"("installation_id");
