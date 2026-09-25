-- Referências anteriores apontam para pastas de buckets criadas na raiz do Drive.
-- São apenas cache: arquivos e metadados de objetos permanecem inalterados.
DELETE FROM "bucket_folder_refs";

UPDATE "buckets"
SET "provider_root_ref" = NULL
WHERE "provider_root_ref" IS NOT NULL;
