# SID3 MVP Backlog

## Context

SID3 is a NestJS + Angular SaaS/API gateway that exposes Google Drive-backed storage through SID3 REST APIs. The implementation must follow the O1-O3 decisions and contracts before adding extra scope.

## Backend

1. Scaffold backend workspace

   Objective: create the NestJS API app with baseline configuration.

   Scope: project structure, environment validation, health endpoint, OpenAPI setup, global validation pipe, error response shape, request ID middleware.

   Acceptance criteria:
   - API starts locally.
   - `/health` returns healthy status.
   - OpenAPI document is available.
   - Invalid request payloads return the contracted error shape.

   Dependencies: none.

2. Configure PostgreSQL and Prisma

   Objective: create the initial database schema from `docs/contracts/data-model.md`.

   Scope: Prisma schema, migrations, database module, basic repository wiring.

   Acceptance criteria:
   - Migration creates users, projects, API keys, provider integrations, buckets, objects, operation logs, and OAuth states.
   - Unique constraints match the data model.
   - Local database can be started through Docker Compose.

   Dependencies: task 1.

3. Implement identity module

   Objective: support user registration, login, and current user lookup.

   Scope: password hashing, JWT/session issuing, auth guards, register/login/me endpoints.

   Acceptance criteria:
   - User can register and login.
   - Passwords are never stored plaintext.
   - Protected route rejects unauthenticated calls.
   - Tests cover successful login and invalid credentials.

   Dependencies: tasks 1, 2.

4. Implement project module

   Objective: allow authenticated users to create and list projects.

   Scope: project entity/use cases, Prisma repository, project ownership checks.

   Acceptance criteria:
   - User can create a project.
   - User lists only own projects.
   - Duplicate slug per owner is rejected.

   Dependencies: task 3.

5. Implement Google OAuth integration module

   Objective: connect and revoke Google Drive integrations.

   Scope: authorization URL, callback handling, OAuth state validation, token encryption, provider integration persistence, revoke endpoint.

   Acceptance criteria:
   - Authorization URL is generated with minimal configured scopes.
   - Callback stores encrypted tokens and consumes state.
   - Revocation changes integration status and blocks future usage.
   - Token values never appear in API responses or logs.

   Dependencies: tasks 2, 3.

6. Implement API key module

   Objective: create, list, and revoke project-scoped API keys.

   Scope: secret generation, prefix, hash storage, one-time secret response, API key guard.

   Acceptance criteria:
   - API key secret is returned only at creation.
   - Database stores hash and prefix, not plaintext secret.
   - Revoked key cannot call object endpoints.
   - Cross-project access is denied.

   Dependencies: tasks 3, 4.

7. Implement bucket module

   Objective: create and list virtual buckets mapped to a provider integration.

   Scope: bucket entity/use cases, project ownership, provider integration ownership validation.

   Acceptance criteria:
   - User can create bucket for own project and connected integration.
   - Duplicate bucket name per project is rejected.
   - Bucket cannot use another user's provider integration.

   Dependencies: tasks 4, 5.

8. Implement storage provider port and Google Drive adapter

   Objective: isolate Google Drive file operations behind a provider interface.

   Scope: provider port, Google Drive adapter, upload/download/list/delete primitives, provider error mapping.

   Acceptance criteria:
   - Application layer depends on provider port, not Google SDK details.
   - Adapter maps provider errors into SID3 error codes.
   - Unit tests can mock provider behavior.

   Dependencies: task 5.

9. Implement object upload

   Objective: upload file bytes through SID3 API into Google Drive and persist metadata.

   Scope: multipart handling, object key validation, `PENDING` -> `AVAILABLE`/`FAILED` status transitions, audit log.

   Acceptance criteria:
   - API key can upload into an owned bucket.
   - Metadata includes provider file ID, size, content type, status.
   - Failed provider upload records `FAILED` without exposing secrets.

   Dependencies: tasks 6, 7, 8.

10. Implement object list, download, and delete

   Objective: complete MVP object operations.

   Scope: list by bucket/prefix, download stream, idempotent delete, audit logs.

   Acceptance criteria:
   - API key lists only authorized bucket objects.
   - Download streams provider bytes for authorized object.
   - Delete is idempotent and updates object status.
   - Cross-project object access tests fail closed.

   Dependencies: task 9.

## Frontend

11. Scaffold Angular dashboard

   Objective: create the dashboard app shell and API client foundation.

   Scope: routing, auth layout, protected layout, HTTP interceptor, environment config.

   Acceptance criteria:
   - Dashboard starts locally.
   - Protected routes redirect unauthenticated users.
   - API errors render without breaking navigation.

   Dependencies: backend task 1.

12. Implement auth and project screens

   Objective: let users register/login and create/select projects.

   Scope: login/register forms, project list, project creation.

   Acceptance criteria:
   - User can register, login, and see own projects.
   - Form validation matches backend constraints.
   - Auth token/session is applied to dashboard API calls.

   Dependencies: backend tasks 3, 4 and frontend task 11.

13. Implement integrations, buckets, and API key screens

   Objective: support core setup workflow before first upload.

   Scope: Google connect/revoke, integration status, bucket creation/list, API key creation/list/revoke.

   Acceptance criteria:
   - User can start Google connection from dashboard.
   - User can create bucket against connected integration.
   - API key secret is displayed once with clear state.

   Dependencies: backend tasks 5, 6, 7 and frontend task 12.

14. Implement files and logs screens

   Objective: show object metadata and operation history.

   Scope: object table, prefix/status filters, download/delete actions, operation log table.

   Acceptance criteria:
   - User can view files by bucket.
   - User can download and delete an object from dashboard when authorized.
   - Logs show sanitized request and error metadata.

   Dependencies: backend task 10 and frontend task 13.

## Infra and Quality

15. Add local development orchestration

   Objective: make local setup reproducible.

   Scope: Docker Compose, env examples, startup scripts, database migration command, README setup.

   Acceptance criteria:
   - Fresh clone can start database and API with documented commands.
   - No secret values are committed.
   - Required env vars are documented.

   Dependencies: backend tasks 1, 2.

16. Add quality gates and CI baseline

   Objective: enforce build, lint, tests, and contract stability.

   Scope: lint/typecheck/test scripts, CI workflow, secret scan placeholder or tool, OpenAPI contract check.

   Acceptance criteria:
   - CI runs backend and dashboard checks.
   - Tests fail on type or lint errors.
   - Contract artifact exists and is referenced by docs.

   Dependencies: backend/frontend scaffolds.
