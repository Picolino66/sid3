DROP INDEX IF EXISTS "storage_objects_bucket_id_key_key";

CREATE INDEX IF NOT EXISTS "storage_objects_bucket_id_key_idx" ON "storage_objects"("bucket_id", "key");
