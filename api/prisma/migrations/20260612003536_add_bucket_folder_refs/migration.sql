-- CreateTable
CREATE TABLE "bucket_folder_refs" (
    "id" UUID NOT NULL,
    "bucket_id" UUID NOT NULL,
    "provider_integration_id" UUID NOT NULL,
    "folder_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bucket_folder_refs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bucket_folder_refs_bucket_id_provider_integration_id_key" ON "bucket_folder_refs"("bucket_id", "provider_integration_id");

-- AddForeignKey
ALTER TABLE "bucket_folder_refs" ADD CONSTRAINT "bucket_folder_refs_bucket_id_fkey" FOREIGN KEY ("bucket_id") REFERENCES "buckets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bucket_folder_refs" ADD CONSTRAINT "bucket_folder_refs_provider_integration_id_fkey" FOREIGN KEY ("provider_integration_id") REFERENCES "provider_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
