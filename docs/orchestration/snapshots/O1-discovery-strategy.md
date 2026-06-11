# O1 Snapshot: Discovery & Strategy

## Snapshot Metadata

- Snapshot ID: O1
- Phase completed: F1 -- Discovery & Strategy
- Timestamp: 2026-05-24
- Gate status: APPROVED_WITH_RISKS
- Frozen sections: product, market, business, requirements, scope, feasibility

## Product

SID3 -- SInsideDrive3 is a SaaS/API gateway that converts user-connected Google Drive accounts into a storage backend exposed through SID3 API endpoints. It provides virtual buckets, API keys, and REST operations for upload, download, listing, and deletion.

## Domain

- Primary domain: cloud storage gateway
- Subdomains:
  - User identity and access
  - OAuth provider connection
  - Token security
  - Virtual bucket management
  - Object metadata management
  - File operations
  - API key management
  - Operational logging and quotas

## Personas

### Independent Developer

- Goal: add file storage to a project quickly without configuring S3.
- Pains: cloud storage setup, IAM complexity, cost uncertainty.
- Success: can connect Drive and integrate upload/download endpoints in one short session.

### Early-stage SaaS Founder

- Goal: ship document or image storage before committing to cloud storage spend.
- Pains: limited budget, small team, need for secure isolation per customer.
- Success: stores and retrieves user files through API keys while keeping data separated by account.

### Small Business Operator

- Goal: reuse existing Google Workspace storage for internal file workflows.
- Pains: no dedicated infrastructure team, need auditability and low maintenance.
- Success: operational dashboard shows connected Drive, buckets, files, and basic logs.

### Content Creator or Automation Builder

- Goal: automate upload and retrieval of generated assets or documents.
- Pains: manual Drive workflows, limited technical infrastructure.
- Success: simple API calls manage files in Drive-backed storage.

## Problems

- Initial object storage setup can be too complex for small teams.
- S3 and IAM introduce learning curve and operational overhead.
- Teams may already pay for Google Drive storage but cannot consume it cleanly as an API backend.
- Google Drive is not shaped like object storage, so developers need a gateway that normalizes access.

## MVP Hypothesis

If developers and small teams can connect Google Drive to SID3 and receive secure API endpoints for file CRUD operations within minutes, they will use SID3 as a low-cost storage bridge before migrating to dedicated object storage.

Validation status: accepted as a falsifiable MVP hypothesis for build planning. It still requires external user validation after the first usable prototype.

## Success Metrics

- Account creation completed.
- Google Drive connected successfully.
- First API key generated.
- First file uploaded through the SID3 API.
- First file downloaded through the SID3 API.
- File listing returns only files owned by the authenticated user/project.
- File deletion removes or marks the mapped object consistently.
- Median time from signup to first successful upload.
- Google Drive OAuth failure rate.
- File operation success rate.
- API error rate by operation type.

## Business Model

Initial MVP does not include billing. The likely future model is a SaaS subscription based on usage, projects, storage operations, connected providers, or team features.

## Value Proposition

SID3 gives small teams a low-cost bridge from Google Drive storage to developer-friendly API storage, while preserving a path to provider abstraction and partial S3-compatible workflows.

## Scope Included

- SID3 user login and authentication.
- Google Drive OAuth 2.0 connection.
- Secure encrypted token storage.
- Google Drive connection revocation.
- Virtual bucket creation.
- Upload file to Google Drive through SID3 API.
- Download file through SID3 API.
- List stored files.
- Delete stored files.
- Generate API key by user/project.
- Basic file metadata persistence in PostgreSQL.
- Simple dashboard for integrations, buckets, and files.
- Operation logs.

## Scope Excluded

- Complete S3 compatibility.
- Advanced multipart upload.
- CDN.
- Distributed cache.
- Object versioning.
- Multiple storage providers.
- Official SDK.
- Billing and payments.
- Mobile application.
- Complex team permissions.
- Advanced client-side encryption.

## Functional Requirements

- Users can create accounts and authenticate.
- Users can connect Google Drive via OAuth 2.0.
- Users can revoke Google Drive access.
- Users can create virtual buckets.
- Users can generate and rotate API keys.
- API clients can upload files to a virtual bucket.
- API clients can download files by object identifier or key.
- API clients can list files in a bucket.
- API clients can delete files.
- Dashboard users can view integrations, buckets, and file metadata.
- System records operation logs for file operations.

## Non-functional Requirements

- Google tokens must be encrypted at rest.
- OAuth scopes must be minimal for the required Drive operations.
- API endpoints must enforce user/project isolation.
- API access must use API Key and JWT where appropriate.
- Logs must not expose secrets or file contents.
- Provider-specific logic must be isolated to support future providers.
- System must respect Google Drive API limits and policies.
- Metadata persistence must support future S3-like object semantics.

## Business Rules

- A user can access only their own projects, buckets, files, tokens, and API keys.
- Each file operation must resolve through a SID3 project and virtual bucket.
- API keys belong to a user/project and must be revocable.
- Google Drive tokens must never be returned to clients.
- A revoked Google integration blocks future file operations for that provider.
- Public file exposure is disabled unless an explicit controlled sharing feature is designed later.
- File metadata in SID3 is the source of truth for SID3 object identity.

## Feasibility

Verdict: VIAVEL_COM_RISCOS

### Key Risks

- Google Drive API quota and rate-limit behavior may constrain throughput.
- OAuth verification and Google API policies may affect production launch.
- Broad Drive scopes can increase security and compliance burden.
- Google Drive folder/file semantics differ from S3 object storage semantics.
- Token encryption and revocation must be implemented correctly from the start.
- Download/upload latency depends on Google Drive API behavior.

### Risk Mitigations

- Use minimum OAuth scopes that still support required file operations.
- Keep provider access behind explicit ports/adapters.
- Store encrypted refresh/access tokens with key rotation strategy planned in F2.
- Add operation logs and provider error mapping from MVP.
- Treat S3 compatibility as a later contract layer, not the initial API.
- Define quota handling and retry/backoff in architecture.

## F1 Quality Gate

- Personas structured with pains and goals: PASS
- MVP hypothesis declared and falsifiable: PASS
- Scope included/excluded explicitly defined: PASS
- Success metrics defined and measurable: PASS
- Feasibility evaluated as viable or viable with risks: PASS

Gate result: APPROVED_WITH_RISKS
