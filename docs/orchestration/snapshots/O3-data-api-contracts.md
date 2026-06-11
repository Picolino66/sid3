# O3 Snapshot: Data & API Contracts

## Snapshot Metadata

- Snapshot ID: O3
- Phase completed: F3 -- Data & API Contracts
- Timestamp: 2026-05-24
- Gate status: APPROVED_WITH_RISKS
- Frozen sections: contracts

## Contract Artifacts

- Data model: `docs/contracts/data-model.md`
- OpenAPI v1: `docs/contracts/openapi-v1.yaml`
- Consistency ADR: `docs/orchestration/adr/ADR-0005-data-consistency.md`

## Schemas

- User
- Project
- ApiKey
- ProviderIntegration
- Bucket
- StorageObject
- OperationLog
- OAuthState

## API Surface

- Auth: register, login, current user
- Projects: create and list
- Google integration: authorize, callback, list, revoke
- API keys: create, list, revoke
- Buckets: create and list
- Objects: upload, list, download, delete

## Consistency Model

SID3 uses strong consistency for PostgreSQL metadata and eventual consistency between SID3 and Google Drive provider state. Provider operations must use explicit object statuses and idempotent delete semantics.

## Transaction Boundaries

- Auth and project creation use single database transactions.
- OAuth callback validates state, encrypts tokens, stores integration, and consumes state transactionally.
- API key creation stores only hash and prefix; plaintext secret is returned once.
- Upload and delete span database state changes plus provider calls, with explicit recovery statuses.
- Download validates metadata and authorization before streaming provider bytes.

## F3 Quality Gate

- Schema versioned and reviewed: PASS
- OpenAPI spec generated with concrete schemas: PASS
- Consistency model chosen with ADR: PASS
- Transaction boundaries mapped: PASS
- DTOs avoid undefined `any` or generic object shapes: PASS

Gate result: APPROVED_WITH_RISKS
