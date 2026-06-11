# ADR-0004: Security Model

## Status

Accepted with risks

## Date

2026-05-24

## Context

SID3 handles user accounts, API keys, Google OAuth tokens, file metadata, and file operations through external storage providers. A token leak or authorization bug could expose user files or allow unauthorized operations.

The MVP must implement security from the start, especially token encryption, least-privilege OAuth scopes, user/project isolation, and revocation.

## Decision

Use a layered security model:

- Dashboard authentication uses user sessions/JWT.
- External file API access uses project-scoped API keys.
- API keys are shown once, then stored only as hashes with a non-secret prefix for lookup.
- Google OAuth tokens are encrypted at rest.
- Encryption uses authenticated encryption, with keys supplied from environment or a managed secret provider.
- Google OAuth starts with the minimum viable Drive scope, preferably `drive.file` unless F3 proves broader scope is required.
- Every file operation enforces ownership through user, project, bucket, object metadata, and provider integration checks.
- Provider tokens are never returned to clients.
- Users can revoke Google Drive integration.
- Logs must not include token values, API keys, file contents, or sensitive OAuth payloads.
- Rate limiting and operation audit logs are mandatory for public API endpoints.

## Options Considered

1. Store OAuth tokens as plain encrypted database fields with a static app secret.
   - Partially accepted only for MVP if key rotation is documented and the secret never enters source control.

2. Use a managed KMS or Vault from day one.
   - Deferred because budget is low, but the architecture must allow migration.

3. Avoid storing refresh tokens.
   - Rejected because SID3 needs durable provider access for API operations after initial OAuth.

## Trade-offs

- Strong token handling increases implementation work, but it is required for user trust.
- API key hashing prevents recovery of leaked database values but requires one-time display and rotation flows.
- Minimal Google scopes reduce risk but may restrict file/folder behavior; this must be validated in F3.

## Consequences

- F3 must define token, API key, integration, bucket, and object schemas carefully.
- F5 must include tests for cross-user and cross-project access denial.
- CI must include secret scanning before production readiness.
- Production deployment must document secret management and rotation.
