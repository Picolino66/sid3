-- AlterTable
ALTER TABLE "drive_index_entries" ADD COLUMN     "drive_id" TEXT,
ADD COLUMN     "is_shared_drive" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "drive_index_entries_provider_integration_id_drive_id_idx" ON "drive_index_entries"("provider_integration_id", "drive_id");

