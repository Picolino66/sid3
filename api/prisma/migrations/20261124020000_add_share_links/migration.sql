-- CreateTable
CREATE TABLE "share_links" (
    "id" UUID NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "provider_integration_id" UUID NOT NULL,
    "name" TEXT,
    "token_hash" TEXT NOT NULL,
    "encrypted_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_link_items" (
    "id" UUID NOT NULL,
    "share_link_id" UUID NOT NULL,
    "provider_file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_link_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_hash_key" ON "share_links"("token_hash");

-- CreateIndex
CREATE INDEX "share_links_owner_user_id_created_at_idx" ON "share_links"("owner_user_id", "created_at");

-- CreateIndex
CREATE INDEX "share_links_provider_integration_id_idx" ON "share_links"("provider_integration_id");

-- CreateIndex
CREATE UNIQUE INDEX "share_link_items_share_link_id_provider_file_id_key" ON "share_link_items"("share_link_id", "provider_file_id");

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_provider_integration_id_fkey" FOREIGN KEY ("provider_integration_id") REFERENCES "provider_integrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_link_items" ADD CONSTRAINT "share_link_items_share_link_id_fkey" FOREIGN KEY ("share_link_id") REFERENCES "share_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

