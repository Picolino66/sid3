# SID3 UX Journeys v1

## Journey 1: First Successful Upload

Persona: Independent Developer

1. User creates account.
2. User creates first project.
3. User connects Google Drive.
4. User creates a virtual bucket.
5. User creates an API key.
6. User copies API key secret once.
7. User sends upload request to SID3 API.
8. Dashboard shows uploaded object metadata.

Success criteria:

- User reaches first upload without manual Google Drive API work.
- API key, bucket, and object ownership are clear in the dashboard.
- Errors explain missing Drive connection, invalid key, or invalid bucket directly.

## Journey 2: Manage Google Drive Integration

Persona: Small Business Operator

1. User opens integrations page.
2. User starts Google OAuth.
3. User grants minimal Drive access.
4. Dashboard shows connected provider status.
5. User revokes connection when needed.

Success criteria:

- Connected, error, and revoked states are visible.
- Revocation blocks future provider operations.
- No token value is visible in the UI.

## Journey 3: External System Reads Stored Files

Persona: Early-stage SaaS Founder

1. User creates project and bucket.
2. User generates project API key.
3. External system uploads files.
4. External system lists objects by prefix.
5. External system downloads a file by object ID.
6. External system deletes obsolete files.

Success criteria:

- External operations work without user JWT.
- Project-scoped API key cannot access another project.
- Object listing shows only authorized bucket contents.

## Journey 4: Diagnose File Operation Failure

Persona: Developer or Operator

1. User opens dashboard.
2. User views object list and operation logs.
3. User identifies failed upload/delete status.
4. User sees provider-level error category without secrets.

Success criteria:

- Logs include request ID, operation, status, timestamp, and sanitized error code.
- Failed objects have explicit status.
- Sensitive values are never displayed.
