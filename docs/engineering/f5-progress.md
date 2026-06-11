# F5 Engineering Execution Progress

## Status

F5 is in progress. The MVP product flow foundation is available and the local quality baseline is enforced, but the F5 quality gate is not fully complete until a real Google OAuth/file-operation smoke test is executed with valid credentials.

## Completed

- Created pnpm monorepo.
- Added NestJS API app.
- Added Angular dashboard app shell.
- Added PostgreSQL and optional Redis Docker Compose services.
- Added Prisma schema matching the O3 data model.
- Generated and applied initial Prisma migration locally.
- Added API health endpoint.
- Added Swagger setup.
- Added dashboard shell for the O4 setup workflow.
- Verified API build.
- Verified dashboard build.
- Verified root build.
- Verified API health endpoint at `/api/v1/health`.
- Added a health service unit test.
- Implemented Identity module with register, login, JWT auth guard, and `/me`.
- Added password hashing with bcryptjs.
- Added AuthService and PasswordService unit tests.
- Verified register, login, and `/me` against local PostgreSQL runtime.
- Implemented Project module with authenticated project creation/listing and slug isolation.
- Added ProjectsService unit tests.
- Verified project creation/listing against local PostgreSQL runtime.
- Implemented Google OAuth Integration module with authorize, callback, list, and revoke endpoints.
- Added OAuth state hashing, expiry, and consumption.
- Added AES-256-GCM token encryption service for provider tokens.
- Added Google OAuth adapter using `google-auth-library`.
- Added IntegrationsService and TokenEncryptionService unit tests.
- Verified protected integration listing against local PostgreSQL runtime.
- Implemented API Key module with create, list, and revoke endpoints.
- Added one-time API key secret generation with public prefix.
- Stored only SHA-256 hash and prefix for API keys.
- Added ApiKeysService and ApiKeySecretService unit tests.
- Verified API key creation/listing/revocation against local PostgreSQL runtime.
- Implemented Bucket module with create and list endpoints.
- Added project ownership validation for bucket routes.
- Added connected provider integration validation for bucket creation.
- Added bucket name validation and duplicate handling.
- Added BucketsService unit tests.
- Verified bucket creation/listing against local PostgreSQL runtime with a connected integration fixture.
- Implemented Storage Provider port and Google Drive adapter.
- Added provider registry for resolving storage providers by `Provider`.
- Added Google Drive upload, download, and delete adapter using `googleapis`.
- Added provider credential decryption through `TokenEncryptionService`.
- Added provider error mapping to `BadGatewayException`.
- Added storage provider registry and Google Drive adapter unit tests.
- Implemented Objects module with API key protected upload/list/download/delete endpoints.
- Added API key guard for `X-SID3-API-Key` validation, revocation checks, and `lastUsedAt` updates.
- Added object metadata lifecycle: `PENDING`, `AVAILABLE`, `FAILED`, `DELETING`, `DELETED`.
- Integrated object operations with the storage provider registry.
- Added operation logs for list, upload, download, and delete paths.
- Added focused ApiKeyAuthGuard and ObjectsService unit tests.
- Implemented dashboard API integration for auth and projects.
- Added Angular auth service, HTTP interceptor, auth guard, login page, and register page.
- Added protected dashboard shell with logout.
- Added projects page with project listing and creation through the API.
- Verified dashboard typecheck, dashboard build, API health, and route availability for `/login`, `/register`, and `/projects`.
- Implemented dashboard pages for integrations, API keys, and buckets.
- Added Angular services for integrations, API keys, and buckets.
- Added Google Drive connect/revoke UI flow.
- Added API key creation/list/revoke UI with one-time secret display.
- Added bucket creation/list UI using selected project and connected integration.
- Updated protected dashboard navigation and routes.
- Implemented dashboard Files page for object operations.
- Added Angular ObjectsService for list/upload/download/delete using `X-SID3-API-Key`.
- Added project, bucket, and API key selection for file workflows.
- Added prefix filtering, multipart upload, browser download, and delete actions.
- Updated navigation and protected route for `/files`.
- Implemented Operation Logs module with authenticated project-scoped log listing.
- Added limit validation and project ownership enforcement for log queries.
- Added focused OperationLogsService unit tests.
- Implemented dashboard Logs page with project filter, limit control, refresh, and newest-first audit table.
- Added Angular OperationLogsService and protected route/navigation for `/logs`.
- Added Angular Google OAuth callback route/page to complete Drive authorization after Google consent.
- Added sanitized backend logs for Google OAuth state creation, callback receipt, invalid/expired state diagnostics, successful connection, revocation, and callback failures.
- Added active object key conflict handling for uploads with `409 Conflict` and operation log error code.
- Changed object key database constraint to allow reusing a key after the previous object is deleted.
- Updated the versioned OpenAPI contract with the project operation logs endpoint and response schema.
- Verified API typecheck, API build, focused operation logs tests, dashboard typecheck, and dashboard build.
- Added GitHub Actions CI workflow with security, API, and dashboard jobs.
- Added root security scripts for secret scanning and high-severity dependency audit.
- Added lightweight local secret scanner excluding generated/dependency artifacts.
- Added API coverage script and Jest global 80% coverage threshold for behavioral backend units.
- Expanded backend tests for JWT guard, token encryption failures, storage provider registry failures, and object upload/download/delete branches.
- Verified API tests serially: 15 suites, 60 tests passing.
- Verified API coverage gate: 95.6% statements, 80.62% branches, 98.95% functions, 95.18% lines.
- Verified isolated API typecheck/build and dashboard typecheck/build.
- Verified secret scan and dependency audit.
- Added formal OpenAPI validation using `@apidevtools/swagger-parser`.
- Added `contracts:validate` script and CI OpenAPI contract validation step.
- Verified OpenAPI contract validation: 15 paths and 19 schemas.
- Added interactive Google Drive smoke test script for register/login, OAuth connection, project/API key/bucket creation, upload/list/download/delete, log verification, and API key cleanup.
- Added Google Drive smoke test runbook.

## Pending From F5

- Execute real Google OAuth callback and Drive upload/download/delete smoke test with valid credentials.
