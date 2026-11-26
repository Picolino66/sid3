-- AlterTable
ALTER TABLE "provider_integrations" ADD COLUMN     "provider_account_id" TEXT,
ADD COLUMN     "last_error" TEXT,
ADD COLUMN     "last_error_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "project_connections" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "provider_integration_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_integrations_user_id_provider_account_id_idx" ON "provider_integrations"("user_id", "provider_account_id");

-- CreateIndex
CREATE INDEX "project_connections_provider_integration_id_idx" ON "project_connections"("provider_integration_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_connections_project_id_provider_integration_id_key" ON "project_connections"("project_id", "provider_integration_id");

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_connections" ADD CONSTRAINT "project_connections_provider_integration_id_fkey" FOREIGN KEY ("provider_integration_id") REFERENCES "provider_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: vincula a cada projeto as conexões que seus buckets e pools já usam.
INSERT INTO "project_connections" ("id", "project_id", "provider_integration_id")
SELECT gen_random_uuid(), links.project_id, links.provider_integration_id
FROM (
    SELECT b."project_id", b."provider_integration_id"
    FROM "buckets" b
    WHERE b."provider_integration_id" IS NOT NULL
    UNION
    SELECT p."project_id", m."provider_integration_id"
    FROM "storage_pool_members" m
    JOIN "storage_pools" p ON p."id" = m."pool_id"
) AS links
ON CONFLICT ("project_id", "provider_integration_id") DO NOTHING;

-- Backfill: todo objeto passa a registrar a conexão onde está guardado (antes só objetos de pool registravam).
UPDATE "storage_objects" o
SET "resolved_integration_id" = b."provider_integration_id"
FROM "buckets" b
WHERE o."bucket_id" = b."id"
  AND o."resolved_integration_id" IS NULL
  AND b."provider_integration_id" IS NOT NULL;
