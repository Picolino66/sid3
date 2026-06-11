# SID3 Orchestration

This directory stores the canonical engineering orchestration context for SID3.

## Current State

- Project: SID3 -- SInsideDrive3
- Mode: full-pipeline
- Current phase: F5 ready
- Last stable snapshot: O4
- F1 gate status: APPROVED_WITH_RISKS
- F2 gate status: APPROVED_WITH_RISKS
- F3 gate status: APPROVED_WITH_RISKS
- F4 gate status: APPROVED_WITH_RISKS
- F5 status: IN_PROGRESS

## Files

- `context.json`: live `OrchestratorContext` shared across phases.
- `snapshots/O1-discovery-strategy.md`: frozen F1 discovery and strategy snapshot.
- `snapshots/O2-architecture-design.md`: frozen F2 architecture and design snapshot.
- `snapshots/O3-data-api-contracts.md`: frozen F3 data and API contracts snapshot.
- `snapshots/O4-ux-planning.md`: frozen F4 UX and planning snapshot.
- `adr/ADR-0001-product-scope-mvp.md`: product scope and MVP boundary decision.
- `adr/ADR-0002-architecture-pattern.md`: architecture pattern decision.
- `adr/ADR-0003-technology-stack.md`: technology stack decision.
- `adr/ADR-0004-security-model.md`: security model decision.
- `adr/ADR-0005-data-consistency.md`: data and provider consistency decision.
- `../contracts/data-model.md`: v1 data model.
- `../contracts/openapi-v1.yaml`: v1 REST API contract.
- `../ux/journeys.md`: MVP user journeys.
- `../ux/wireframes.md`: dashboard structural wireframes.
- `../engineering/backlog.md`: implementation backlog.
- `../engineering/f5-progress.md`: current F5 implementation progress.

## Phase Rules

- Implementation can start from F5, following O1-O4 decisions and quality gates.
- Any future change to O1 scope must create a new ADR or amend the existing one.
- Requirements must trace forward into architecture, API contracts, implementation, tests, and deploy evidence.
