# ADR-0005: Data and Provider Consistency Model

## Status

Accepted with risks

## Date

2026-05-24

## Context

SID3 stores metadata in PostgreSQL while file bytes live in Google Drive. A single ACID transaction cannot cover both PostgreSQL and Google Drive API operations. Uploads, downloads, and deletes must therefore handle partial failure, retries, and provider latency explicitly.

## Decision

Use strong consistency for SID3-owned PostgreSQL metadata and eventual consistency between SID3 metadata and Google Drive provider state.

File operations must be modeled with explicit statuses:

- `PENDING`
- `AVAILABLE`
- `DELETING`
- `DELETED`
- `FAILED`

Upload creates metadata in `PENDING`, uploads to Google Drive, then marks the object `AVAILABLE`. Delete marks the object `DELETING`, performs provider deletion/trash, then marks the object `DELETED`. Repeated delete calls are idempotent.

## Options Considered

1. Treat Google Drive and PostgreSQL as strongly consistent.
   - Rejected because Google Drive does not participate in database transactions.

2. Store no metadata and query Google Drive directly.
   - Rejected because SID3 needs ownership, virtual buckets, API keys, future provider support, and auditability.

3. Use local strong metadata plus eventual provider consistency.
   - Accepted because it is honest about provider behavior and supports recovery flows.

## Trade-offs

- The system must handle reconciliation for stuck `PENDING` or `DELETING` objects.
- API responses can be deterministic from SID3 metadata even when provider state needs cleanup.
- Background reconciliation can be added after MVP if operation volume requires it.

## Consequences

- F5 must implement idempotency around delete and retryable provider failures.
- F6 must test partial failure paths.
- Operation logs must capture provider errors without leaking secrets.
