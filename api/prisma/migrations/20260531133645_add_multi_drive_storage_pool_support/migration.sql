-- CreateEnum
CREATE TYPE "PoolRoutingStrategy" AS ENUM ('ROUND_ROBIN', 'FILL_FIRST', 'WEIGHTED');

-- AlterTable
ALTER TABLE "buckets" ADD COLUMN     "storage_pool_id" UUID,
ALTER COLUMN "provider_integration_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "provider_integrations" ADD COLUMN     "display_name" TEXT;

-- AlterTable
ALTER TABLE "storage_objects" ADD COLUMN     "resolved_integration_id" UUID;

-- CreateTable
CREATE TABLE "storage_pools" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "strategy" "PoolRoutingStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_pools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_pool_members" (
    "id" UUID NOT NULL,
    "pool_id" UUID NOT NULL,
    "provider_integration_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "round_robin_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_pool_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "storage_pools_project_id_name_key" ON "storage_pools"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "storage_pool_members_pool_id_provider_integration_id_key" ON "storage_pool_members"("pool_id", "provider_integration_id");

-- AddForeignKey
ALTER TABLE "storage_pools" ADD CONSTRAINT "storage_pools_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_pool_members" ADD CONSTRAINT "storage_pool_members_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "storage_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_pool_members" ADD CONSTRAINT "storage_pool_members_provider_integration_id_fkey" FOREIGN KEY ("provider_integration_id") REFERENCES "provider_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buckets" ADD CONSTRAINT "buckets_storage_pool_id_fkey" FOREIGN KEY ("storage_pool_id") REFERENCES "storage_pools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_resolved_integration_id_fkey" FOREIGN KEY ("resolved_integration_id") REFERENCES "provider_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
