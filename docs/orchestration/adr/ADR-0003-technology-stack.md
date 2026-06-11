# ADR-0003: Technology Stack

## Status

Accepted

## Date

2026-05-24

## Context

SID3 needs a low-cost, TypeScript-friendly stack for API-first development, OAuth integration, secure token storage, relational metadata, API documentation, and a simple dashboard.

The requested preferred stack includes NestJS, PostgreSQL, Prisma, optional Redis, and Angular or Next.js for the dashboard.

## Decision

Use the following MVP stack:

- Runtime and language: Node.js with TypeScript
- Backend: NestJS
- Database: PostgreSQL
- ORM: Prisma
- Dashboard: Angular
- Cache/rate limiting: Redis optional, introduced only if rate limiting, token refresh coordination, or job retry needs justify it
- API documentation: OpenAPI generated from NestJS
- Local development: Docker Compose for PostgreSQL and optional Redis
- Package manager: pnpm
- Testing: Jest and Supertest for backend; Angular component/unit tests for dashboard

Angular is selected for the dashboard because SID3's web UI is an authenticated operational console, not an SEO-driven marketing surface.

## Options Considered

1. NestJS + Angular + PostgreSQL + Prisma.
   - Accepted as the default full TypeScript stack with strong modularity and dashboard fit.

2. NestJS + Next.js.
   - Rejected for MVP dashboard because SSR/SEO is not a core requirement for the authenticated app.

3. Single Next.js full-stack application.
   - Rejected because SID3 is primarily an API gateway and benefits from a dedicated backend architecture.

## Trade-offs

- Angular adds a separate app surface, but keeps the dashboard strongly structured.
- Prisma improves delivery speed and schema control, but migrations and raw SQL performance paths must be managed deliberately.
- Redis remains optional to avoid unnecessary infrastructure in the first build.

## Consequences

- Repository should be structured as a monorepo with `apps/api`, `apps/dashboard`, and shared packages only when needed.
- Backend modules must remain independent of Angular concerns.
- F3 contracts should drive both API controllers and dashboard client generation or typed API access.
