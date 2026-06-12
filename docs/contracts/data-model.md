# SID3 Data Model v1

## Model Principles

- PostgreSQL stores SID3 identity, project, bucket, object metadata, provider mappings, API keys, and audit logs.
- Google Drive stores file bytes.
- SID3 object identity is independent from Google Drive file IDs.
- Provider-specific identifiers stay in provider mapping fields, not in public API contracts.
- API key secrets and Google OAuth tokens are never stored in plaintext.

## Entities

### User

- `id`: UUID primary key
- `email`: unique, required
- `password_hash`: required for password auth
- `name`: optional
- `created_at`, `updated_at`

### Project

- `id`: UUID primary key
- `owner_user_id`: FK -> User
- `name`: required
- `slug`: unique per owner
- `created_at`, `updated_at`

### ApiKey

- `id`: UUID primary key
- `project_id`: FK -> Project
- `name`: required
- `prefix`: unique public lookup prefix
- `secret_hash`: required
- `last_used_at`: optional
- `revoked_at`: optional
- `created_at`, `updated_at`

### ProviderIntegration

- `id`: UUID primary key
- `user_id`: FK -> User
- `provider`: enum, initially `GOOGLE_DRIVE`
- `provider_account_email`: optional
- `encrypted_access_token`: required
- `encrypted_refresh_token`: required when supplied by Google
- `token_expires_at`: optional
- `scopes`: string array or normalized scope table
- `status`: `CONNECTED`, `REVOKED`, `ERROR`
- `revoked_at`: optional
- `created_at`, `updated_at`

### StoragePool

- `id`: UUID primary key
- `project_id`: FK -> Project
- `name`: unique per project
- `strategy`: enum `ROUND_ROBIN`, `FILL_FIRST`, `WEIGHTED`
- `created_at`, `updated_at`

### StoragePoolMember

- `id`: UUID primary key
- `pool_id`: FK -> StoragePool (cascade delete)
- `provider_integration_id`: FK -> ProviderIntegration (restrict delete)
- `weight`: integer, default 1 (used by WEIGHTED strategy)
- `round_robin_index`: integer, default 0 (cursor for ROUND_ROBIN)
- `created_at`

### Bucket

- `id`: UUID primary key
- `project_id`: FK -> Project
- `provider_integration_id`: optional FK -> ProviderIntegration (direct single-drive bucket)
- `storage_pool_id`: optional FK -> StoragePool (pool-backed bucket)
- `name`: unique per project
- `provider_root_ref`: optional — cached Google Drive folder ID for direct-drive buckets; lazily populated on first upload
- `created_at`, `updated_at`

> Either `provider_integration_id` or `storage_pool_id` must be set, not both.

### BucketFolderRef

Cache mapping a bucket to its corresponding Google Drive folder on each drive in a pool. For direct-drive buckets, `provider_root_ref` on the bucket is used instead.

- `id`: UUID primary key
- `bucket_id`: FK -> Bucket (cascade delete)
- `provider_integration_id`: FK -> ProviderIntegration (cascade delete)
- `folder_id`: Google Drive folder ID on this specific drive
- `created_at`
- `UNIQUE(bucket_id, provider_integration_id)`

### StorageObject

- `id`: UUID primary key
- `project_id`: FK -> Project
- `bucket_id`: FK -> Bucket
- `owner_user_id`: FK -> User
- `resolved_integration_id`: optional FK -> ProviderIntegration — records which pool member was used; null for direct-drive buckets
- `key`: required, unique per bucket for active objects
- `provider`: enum, initially `GOOGLE_DRIVE`
- `provider_file_id`: Google Drive file ID; file is stored inside the bucket's Drive folder
- `file_name`: required
- `content_type`: required
- `size_bytes`: integer
- `checksum_sha256`: optional
- `status`: `PENDING`, `AVAILABLE`, `DELETING`, `DELETED`, `FAILED`
- `deleted_at`: optional
- `created_at`, `updated_at`

### OperationLog

- `id`: UUID primary key
- `project_id`: FK -> Project
- `user_id`: optional FK -> User
- `api_key_id`: optional FK -> ApiKey
- `bucket_id`: optional FK -> Bucket
- `object_id`: optional FK -> StorageObject
- `operation`: `UPLOAD`, `DOWNLOAD`, `LIST`, `DELETE`, `OAUTH_CONNECT`, `OAUTH_REVOKE`, `API_KEY_CREATE`, `API_KEY_REVOKE`
- `status`: `SUCCESS`, `FAILED`
- `provider`: optional
- `error_code`: optional
- `request_id`: required
- `created_at`

### OAuthState

- `id`: UUID primary key
- `user_id`: FK -> User
- `state_hash`: required
- `redirect_uri`: required
- `expires_at`: required
- `consumed_at`: optional
- `created_at`

## Constraints

- `User.email` unique.
- `Project.slug` unique per `owner_user_id`.
- `ApiKey.prefix` unique.
- `Bucket.name` unique per `project_id`.
- `StoragePool.name` unique per `project_id`.
- `StoragePoolMember(pool_id, provider_integration_id)` unique.
- `BucketFolderRef(bucket_id, provider_integration_id)` unique.
- Active `StorageObject.key` unique per `bucket_id` where `deleted_at IS NULL`.
- File operations must validate project ownership before provider access.
- ProviderIntegration must belong to the same owner as the project using it.
- `Bucket.provider_integration_id` and `Bucket.storage_pool_id` are mutually exclusive; exactly one must be set.

## Transaction Boundaries

- User registration: single database transaction.
- Project and bucket creation: single database transaction.
- API key creation: generate secret outside transaction, store hash inside transaction, return plaintext once.
- API key regeneration: generate new secret outside transaction, update `prefix` and `secret_hash` in place, return new plaintext once; existing key ID is preserved.
- OAuth callback: validate state, encrypt tokens, upsert provider integration, mark OAuth state consumed in one transaction.
- Upload: resolve bucket Drive folder (find or create via Drive API, cache in `provider_root_ref` or `BucketFolderRef`), create object as `PENDING`, upload to provider folder, update metadata as `AVAILABLE`; failed provider upload marks object `FAILED`.
- Drive folder resolution (lazy): on first upload to a bucket, search Drive for a folder named after the bucket; create if not found; cache folder ID to avoid repeat Drive API calls.
- Download: read metadata and authorize in one transaction/read boundary, then stream from provider outside transaction.
- Delete: mark object `DELETING`, delete or trash provider file, mark object `DELETED`; repeated delete is idempotent.
- Operation logs are written for every external operation and must not contain secrets.

## Consistency Model

SID3 uses strong consistency for its own PostgreSQL metadata and eventual consistency between SID3 metadata and Google Drive provider state. File operations must be idempotent where provider retries are possible.
