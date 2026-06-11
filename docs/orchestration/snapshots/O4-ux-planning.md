# O4 Snapshot: UX/UI & Planning

## Snapshot Metadata

- Snapshot ID: O4
- Phase completed: F4 -- UX/UI & Planning
- Timestamp: 2026-05-24
- Gate status: APPROVED_WITH_RISKS
- Frozen sections: ux, engineering.backlog, engineering.priorities, engineering.module_map

## UX Artifacts

- Journeys: `docs/ux/journeys.md`
- Wireframes: `docs/ux/wireframes.md`

## Engineering Artifacts

- Backlog: `docs/engineering/backlog.md`
- Test coverage threshold: 80%

## Critical Journeys

- First successful upload
- Manage Google Drive integration
- External system reads stored files
- Diagnose file operation failure

## Module Map

- API app depends on PostgreSQL and optional Redis.
- Dashboard depends on API contract v1.
- Identity is required by projects, integrations, buckets, API keys, files, and logs.
- Projects are required by API keys and buckets.
- Provider integrations are required by buckets and file operations.
- API keys are required by external object operations.
- File operations depend on buckets, objects, provider integrations, provider port, and audit logs.

## Priority Order

1. Backend scaffold and database schema.
2. Identity and project ownership.
3. Google OAuth and encrypted tokens.
4. API keys and guards.
5. Buckets and provider port.
6. Upload, list, download, delete.
7. Dashboard setup workflow.
8. Logs, hardening, and CI.

## F4 Quality Gate

- Critical journeys defined: PASS
- Wireframes generated for MVP screens: PASS
- Backlog generated with executable tasks: PASS
- Stories include acceptance criteria: PASS
- Module dependencies mapped without circular dependency: PASS
- Test coverage threshold registered: PASS

Gate result: APPROVED_WITH_RISKS
