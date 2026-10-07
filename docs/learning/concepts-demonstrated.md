# Concepts Demonstrated

## Service layer
Where to look: [src/services/workflow-run-service.ts](../../src/services/workflow-run-service.ts) — `startWorkflowRun()` owns the API-facing run-start use case without embedding SQL or HTTP details.
Also see: [src/services/workflow-definition-service.ts](../../src/services/workflow-definition-service.ts) for versioning rules.
Risk if wrong: Route handlers become thin wrappers around accidental business logic duplication.

## Repository pattern
Where to look: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) — `listWorkflowRuns()`, `findWorkflowRunById()`, and `appendExecutionEvent()` isolate data access and scoping.
Also see: [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) for queue-specific persistence.
Risk if wrong: Query shape, includes, and scoping drift across callers and create inconsistent data exposure.

## Zod validation boundary
Where to look: [src/lib/validation/api-schemas.ts](../../src/lib/validation/api-schemas.ts) — `createWorkflowSchema`, `startWorkflowRunSchema`, and `approvalDecisionSchema` are the request boundary.
Also see: [src/lib/workflows/definition-schema.ts](../../src/lib/workflows/definition-schema.ts) for validating persisted workflow JSON itself.
Risk if wrong: Broken or malicious payloads reach services and fail much later in less obvious ways.

## Auth/session flow
Where to look: [src/lib/auth/session.ts](../../src/lib/auth/session.ts) — `createSession()` and `getUserFromSessionToken()` implement opaque DB-backed sessions.
Also see: [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts) for the login HTTP boundary.
Risk if wrong: Anonymous requests can impersonate users or expired sessions remain valid.

## Role-based access control
Where to look: [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts) — `rolePermissions` and `hasPermission()` define the access matrix.
Also see: [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts) for `requireRequestUser()`.
Risk if wrong: Low-privilege users can trigger admin-only operations like workflow authoring or approval decisions.

## Ownership-based data isolation
Where to look: [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) — `buildRunVisibilityWhere()` scopes `VIEWER` reads to `startedById`.
Also see: [src/repositories/workflow-run-repository.test.ts](../../src/repositories/workflow-run-repository.test.ts) for the targeted test.
Risk if wrong: Run list/detail endpoints become cross-user data leaks.

## Status and state transitions
Where to look: [src/lib/workflows/run-state-machine.ts](../../src/lib/workflows/run-state-machine.ts) — `assertValidRunTransition()` and `assertValidStepTransition()` define legal transitions.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) where `transitionRunStatus()` and `transitionStepStatus()` enforce those rules.
Risk if wrong: Completed runs could start moving again or retries could bypass valid lifecycle states.

## Background job design
Where to look: [src/services/worker-service.ts](../../src/services/worker-service.ts) — `processNextTask()` claims durable tasks, runs handlers, and reports results back to the engine.
Also see: [src/worker/index.ts](../../src/worker/index.ts) for the polling loop.
Risk if wrong: Work disappears on restart or multiple workers process the same task.

## Durable task leasing
Where to look: [src/repositories/task-repository.ts](../../src/repositories/task-repository.ts) — `claimNextAvailableTask()` uses `FOR UPDATE SKIP LOCKED`.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — `markTaskExecutionStarted()` and `failTaskStep()`.
Risk if wrong: Duplicate execution and impossible-to-debug race conditions under concurrency.

## Idempotency across retries
Where to look: [src/services/worker-service.ts](../../src/services/worker-service.ts) — `runIdempotentAction()` stores reusable results in `IdempotencyRecord`.
Also see: [prisma/schema.prisma](../../prisma/schema.prisma) — `model IdempotencyRecord`.
Risk if wrong: A retry can replay an external side effect after a crash or lease loss.

## Approval workflow design
Where to look: [src/services/approval-service.ts](../../src/services/approval-service.ts) — `submitApprovalDecision()` is the explicit approval use case.
Also see: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — `resolveApprovalStep()` advances the workflow after the human decision.
Risk if wrong: Approval UI changes state without durable audit history or server-side authorization.

## Audit logging / execution history
Where to look: [src/services/workflow-engine-service.ts](../../src/services/workflow-engine-service.ts) — calls to `appendExecutionEvent()` accompany run/step state changes.
Also see: [src/components/runs/run-detail.tsx](../../src/components/runs/run-detail.tsx) for how that history is surfaced.
Risk if wrong: Operators lose the evidence needed to explain why a run retried, paused, failed, or completed.
