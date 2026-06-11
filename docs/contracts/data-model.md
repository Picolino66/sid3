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

### Bucket

- `id`: UUID primary key
- `project_id`: FK -> Project
- `provider_integration_id`: FK -> ProviderIntegration
- `name`: unique per project
- `provider_root_ref`: optional Google Drive folder ID or app folder marker
- `created_at`, `updated_at`

### StorageObject

- `id`: UUID primary key
- `project_id`: FK -> Project
- `bucket_id`: FK -> Bucket
- `owner_user_id`: FK -> User
- `key`: required, unique per bucket for active objects
- `provider`: enum, initially `GOOGLE_DRIVE`
- `provider_file_id`: Google Drive file ID
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
- Active `StorageObject.key` unique per `bucket_id` where `deleted_at IS NULL`.
- File operations must validate project ownership before provider access.
- ProviderIntegration must belong to the same owner as the project using it.

## Transaction Boundaries

- User registration: single database transaction.
- Project and bucket creation: single database transaction.
- API key creation: generate secret outside transaction, store hash inside transaction, return plaintext once.
- OAuth callback: validate state, encrypt tokens, upsert provider integration, mark OAuth state consumed in one transaction.
- Upload: create object as `PENDING`, upload to provider, update metadata as `AVAILABLE`; failed provider upload marks object `FAILED`.
- Download: read metadata and authorize in one transaction/read boundary, then stream from provider outside transaction.
- Delete: mark object `DELETING`, delete or trash provider file, mark object `DELETED`; repeated delete is idempotent.
- Operation logs are written for every external operation and must not contain secrets.

## Consistency Model

SID3 uses strong consistency for its own PostgreSQL metadata and eventual consistency between SID3 metadata and Google Drive provider state. File operations must be idempotent where provider retries are possible.
