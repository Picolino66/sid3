-- CreateEnum
CREATE TYPE "DriveIndexStatus" AS ENUM ('NEVER_INDEXED', 'INDEXING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "provider_integrations" ADD COLUMN     "drive_index_changes_token" TEXT,
ADD COLUMN     "drive_index_item_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "drive_index_last_error" TEXT,
ADD COLUMN     "drive_index_root_folder_id" TEXT,
ADD COLUMN     "drive_index_started_at" TIMESTAMP(3),
ADD COLUMN     "drive_index_status" "DriveIndexStatus" NOT NULL DEFAULT 'NEVER_INDEXED',
ADD COLUMN     "drive_indexed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "drive_index_entries" (
    "id" UUID NOT NULL,
    "provider_integration_id" UUID NOT NULL,
    "provider_file_id" TEXT NOT NULL,
    "parent_file_id" TEXT,
    "name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "is_folder" BOOLEAN NOT NULL DEFAULT false,
    "size_bytes" BIGINT,
    "md5_checksum" TEXT,
    "modified_time" TIMESTAMP(3),
    "web_view_link" TEXT,
    "indexed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_index_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "drive_index_entries_provider_integration_id_parent_file_id_idx" ON "drive_index_entries"("provider_integration_id", "parent_file_id");

-- CreateIndex
CREATE INDEX "drive_index_entries_provider_integration_id_indexed_at_idx" ON "drive_index_entries"("provider_integration_id", "indexed_at");

-- CreateIndex
CREATE UNIQUE INDEX "drive_index_entries_provider_integration_id_provider_file_i_key" ON "drive_index_entries"("provider_integration_id", "provider_file_id");

-- AddForeignKey
ALTER TABLE "drive_index_entries" ADD CONSTRAINT "drive_index_entries_provider_integration_id_fkey" FOREIGN KEY ("provider_integration_id") REFERENCES "provider_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
