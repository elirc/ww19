# Architecture Overview

Flowkeeper is a Temporal-lite orchestration app built as one Next.js codebase with a separate worker entrypoint. The web app owns the REST API and monitoring UI, while the worker in [src/worker/index.ts](../../src/worker/index.ts) leases durable tasks from PostgreSQL and pushes results back through [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts).

## Folder map

- `prisma/`
  `schema.prisma` in [prisma/schema.prisma](../../prisma/schema.prisma) defines users, sessions, workflow definitions, runs, step runs, approval requests, tasks, idempotency records, and execution events. `seed.ts` in [prisma/seed.ts](../../prisma/seed.ts) creates demo users and a sample workflow version.
- `src/app/api/`
  Route handlers like [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) and [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts) form the HTTP boundary. They do auth, Zod parsing, then delegate to services.
- `src/lib/`
  Shared infrastructure lives here: [src/lib/auth/session.ts](../../src/lib/auth/session.ts) for DB-backed sessions, [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) for guard/error helpers, [src/lib/workflows/definition-schema.ts](../../src/lib/workflows/definition-schema.ts) for validating persisted workflow JSON, and [src/lib/workflows/run-state-machine.ts](../../src/lib/workflows/run-state-machine.ts) for allowed status transitions.
- `src/repositories/`
  Data access is isolated here. Examples: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) owns scoped run reads and step/event writes, while [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) owns durable queue reads plus the `FOR UPDATE SKIP LOCKED` claim query.
- `src/services/`
  Business logic lives here. [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts) starts runs, [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts) versions workflow definitions, [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) advances steps and run state, [src/services/approval-service.ts](../../src/services/approval-service.ts) resolves approvals, and [src/services/worker-service.ts](../../src/services/worker-service.ts) bridges leased tasks to handlers.
- `src/worker/`
  [src/worker/handlers/index.ts](../../src/worker/handlers/index.ts) registers task handlers, and [src/worker/index.ts](../../src/worker/index.ts) runs the polling loop.
- `src/components/` and `src/hooks/`
  The UI is thin. Hooks like [src/hooks/use-runs.ts](../../src/hooks/use-runs.ts) call the REST API through [src/lib/api/client.ts](../../src/lib/api/client.ts), and components like [src/components/runs/run-detail.tsx](../../src/components/runs/run-detail.tsx) render server-owned data instead of embedding business logic.

## Why Prisma and REST

Prisma was chosen over Drizzle because this project’s teaching value depends on moving quickly across a fairly relational schema with nested includes, enums, and migrations. The raw SQL worker lease in [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) still shows where Prisma stops and lower-level database control begins.

REST was chosen over tRPC because the route handlers themselves are part of the learning artifact. Files like [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) make the request path, auth boundary, validation boundary, and returned shape explicit in a way that is easy to trace.
