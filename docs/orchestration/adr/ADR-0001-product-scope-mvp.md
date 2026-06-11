# ADR-0001: Product Scope and MVP Boundary

## Status

Accepted with risks

## Date

2026-05-24

## Context

SID3 -- SInsideDrive3 is a SaaS/API gateway that turns user-connected Google Drive accounts into an S3-like storage layer. Users authenticate with SID3, connect Google Drive through OAuth 2.0, create virtual buckets, and receive API endpoints for file upload, download, listing, and deletion.

The target users are developers, early-stage SaaS teams, small companies, creators, and systems that need file storage before adopting object storage infrastructure such as Amazon S3.

The product must minimize initial cost and complexity while preserving a path toward partial S3 compatibility and future provider expansion.

## Decision

The MVP will focus on a narrow Google Drive-backed storage gateway:

- SID3 user authentication.
- Google OAuth 2.0 connection.
- Encrypted storage of Google tokens.
- Revocation of Google Drive connection.
- Virtual bucket creation.
- Upload, download, listing, and deletion of files.
- SID3 REST API protected by API Key and JWT where appropriate.
- Basic metadata registry in PostgreSQL.
- Simple web dashboard for integrations, buckets, and files.

The MVP will explicitly exclude:

- Full S3 API compatibility.
- Advanced multipart upload.
- CDN or distributed cache.
- Object versioning.
- Additional providers such as OneDrive, Dropbox, or real S3.
- Official SDKs.
- Billing and payments.
- Mobile apps.
- Complex team permission models.
- Advanced client-side encryption.

## Options Considered

1. Build full S3 compatibility from the start.
   - Rejected because it would increase scope, contract complexity, and test surface before validating demand.

2. Build a generic multi-provider storage abstraction first.
   - Rejected for MVP because it would delay the first usable Google Drive integration and introduce provider-specific edge cases too early.

3. Build a focused Google Drive gateway with internal abstractions prepared for future providers.
   - Accepted because it validates the core user value while keeping the architecture evolvable.

## Trade-offs

- SID3 can ship faster, but early API semantics will not be fully compatible with S3.
- Google Drive API quotas, OAuth verification, and policy constraints become central product risks.
- Provider abstraction must be designed early enough to avoid coupling the domain model directly to Google Drive.
- The dashboard remains operational and simple, not a full storage management console.

## Consequences

- Architecture must isolate provider-specific Google Drive behavior behind ports/adapters.
- Token encryption and revocation are non-negotiable security requirements.
- API contracts must distinguish SID3 virtual objects from raw Google Drive files.
- Metadata in PostgreSQL is required even though file bytes live in Google Drive.
- Future S3 compatibility must be treated as an evolution path, not as an implicit MVP promise.
