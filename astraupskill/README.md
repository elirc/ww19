# WW19 workflow-run idempotency course

ww19 is a workflow-orchestration app. It is built on Next.js route handlers with Prisma and PostgreSQL (`prisma/migrations/202604121613_init/migration.sql`), and it uses real database-backed sessions (`src/lib/auth/session.ts`), versioned workflow definitions, a step engine, approvals, and a separate worker process (`src/worker/index.ts`). This course follows one entry point: `startWorkflowRun` in [`src/services/workflow-run-service.ts`](../src/services/workflow-run-service.ts), lines 42-92.

## The flow

1. Build `scopedIdempotencyKey = \`${user.id}:${input.idempotencyKey}\`` (line 51).
2. Look the key up with `findWorkflowRunByIdempotencyKey` (line 52). If a run exists, return it immediately (54-56). There is no validation, no version lookup, and no seeding.
3. Resolve the **active** version of the definition (58-62), or throw `ApiError(404)`.
4. Parse the stored definition with `workflowDefinitionSchema` (line 64).
5. In `db.$transaction`, create a `PENDING` run with `currentStepKey` set to the definition's `initialStepKey` (66-77).
6. **After** that transaction has committed, call `seedRunExecution` (80-83). The seed opens its **own** transaction (`src/services/workflow-engine-service.ts:363-382`), which writes a `RUN_CREATED` event and the first executable step.
7. Reload with visibility scoping (`findWorkflowRunById`, line 85). A `null` result throws `ApiError(500)` (87-89).

## What was delivered

`tests/workflow-run-idempotency.test.mjs` contains five `node:test` cases that execute the real service through recording doubles. The service is unchanged: `diff astraupskill/snapshots/workflow-run-service.ts.original.txt src/services/workflow-run-service.ts` prints nothing.

## Run it

```text
node --experimental-vm-modules --test tests/workflow-run-idempotency.test.mjs
```

Run it from the repository root (`root: path.resolve('.')`, test line 8). The loader needs `stripTypeScriptTypes` from `node:module`. The other tests in the repo are Vitest files colocated with the source:

- `src/lib/api/route-helpers.test.ts`
- `src/lib/workflows/definition-schema.test.ts`
- `src/lib/workflows/run-state-machine.test.ts`
- `src/repositories/workflow-run-repository.test.ts`

## The two ideas to take away

- **Identity, not content.** The key identifies a command per user. Replaying it with a different payload returns the **old** run unchanged (test line 26).
- **Two transactions, not one.** Creation commits before seeding begins. If seeding fails, the run survives as `PENDING` with no executable step. A replay returns that run without seeding again (test lines 35-38). Nothing in `src/` uses the `runs:repair` permission (`src/lib/auth/permissions.ts:18`), so there is no built-in path to fix such a run. See chapter 06.
