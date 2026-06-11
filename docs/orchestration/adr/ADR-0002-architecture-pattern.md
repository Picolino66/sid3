# ADR-0002: Modular Monolith with Ports and Adapters

## Status

Accepted with risks

## Date

2026-05-24

## Context

SID3 must support authentication, API keys, Google OAuth, encrypted provider tokens, virtual buckets, object metadata, file operations, audit logs, and a dashboard. The MVP has meaningful security and integration complexity, but it does not yet have independent teams, independently scalable bounded contexts, or separate deployment needs.

The architecture must also avoid coupling SID3's domain model directly to Google Drive because future providers and partial S3 compatibility are explicit evolution goals.

## Decision

Use a modular monolith for the MVP, with Clean/Hexagonal boundaries inside each backend module.

The backend will be organized by domain modules:

- Identity and sessions
- Projects
- API keys
- Provider integrations
- Buckets
- Objects and metadata
- File operations
- Audit logs

Each module should expose application use cases and domain ports. Infrastructure adapters will implement persistence, Google Drive access, cryptography, and external HTTP clients.

## Options Considered

1. Simple layered CRUD application.
   - Rejected because provider abstraction, encrypted tokens, API keys, and access isolation need stronger boundaries than a basic CRUD structure.

2. Microservices.
   - Rejected for MVP because there is no current need for independent deployment, separate teams, distributed transactions, or isolated scaling.

3. Modular monolith with ports/adapters.
   - Accepted because it keeps delivery simple while preserving module boundaries and future extraction paths.

## Trade-offs

- Simpler deployment and local development than microservices.
- Stronger boundaries than a basic layered app.
- Requires discipline to prevent modules from bypassing ports.
- Some future scaling work may require extracting workers or provider adapters.

## Consequences

- F3 contracts must define API and persistence boundaries before implementation.
- Google Drive logic must live behind provider ports, never inside controllers or domain entities.
- PostgreSQL metadata is the SID3 source of truth for object identity.
- Any future provider must implement the same internal storage-provider port.
