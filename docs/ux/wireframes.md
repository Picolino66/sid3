# SID3 Wireframes v1

These are structural wireframes for the MVP dashboard. Visual design tokens will be defined during frontend implementation.

## App Shell

- Left navigation: Projects, Buckets, Integrations, API Keys, Files, Logs.
- Top bar: current project selector, user menu.
- Main content: dense operational tables and forms.

## Login/Register

- Centered auth form.
- Fields: name, email, password for register; email and password for login.
- Error area for validation/auth failures.

## Projects

- Project list table: name, slug, created date.
- Primary action: create project.
- Empty state prompts first project creation.

## Integrations

- Google Drive integration card/list row.
- States: not connected, connected, error, revoked.
- Actions: connect, reconnect, revoke.
- Details: provider account email, scopes, last status update.

## Buckets

- Bucket list by selected project.
- Create bucket form: name, provider integration.
- Bucket detail links to object list.

## API Keys

- API key table: name, prefix, created date, last used, revoked state.
- Create key dialog returns secret once.
- Revoke action requires confirmation.

## Files

- Object table: key, filename, size, content type, status, created date.
- Filters: bucket, prefix, status.
- Actions: download, delete.
- Upload is primarily API-driven; dashboard upload can be deferred unless needed for QA.

## Logs

- Operation log table: request ID, operation, status, bucket, object, timestamp, sanitized error code.
- Filters: operation, status, bucket, date.
