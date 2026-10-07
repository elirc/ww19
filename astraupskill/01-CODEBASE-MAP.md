# Codebase map

## Request path

`POST /api/workflow-runs` is handled in `src/app/api/workflow-runs/route.ts:29-39`:

1. `requireRequestUser(request, permissions.runsStart)` (line 31). It reads the `tl_session` cookie, hashes the token, and looks up an unexpired `Session` row (`src/lib/auth/session.ts:47-71`). It returns 401 when there is no valid session and 403 when the role lacks `runs:start` (`src/lib/api/route-helpers.ts:28-41`). `ADMIN` and `OPERATOR` hold `runs:start`. `APPROVER` and `VIEWER` do not (`src/lib/auth/permissions.ts:24-35`).
2. `startWorkflowRunSchema.parse(await request.json())` (line 32). `idempotencyKey` must be 6-100 characters (`src/lib/validation/api-schemas.ts:30`).
3. `startWorkflowRun(user, body)` (line 33).
4. `jsonOk(run, { status: 201 })` (line 35). A replay **also** answers 201.

Errors go to `jsonError` (`route-helpers.ts:47-61`). An `ApiError` keeps its own status. Anything else, including Zod and Prisma errors, is logged and becomes a 500 `{ error: { message: "Internal server error." } }`.

## Service: `src/services/workflow-run-service.ts:42-92`

| Line(s) | Call | Notes |
|---|---|---|
| 51 | build scoped key | `${user.id}:${input.idempotencyKey}` |
| 52 | `findWorkflowRunByIdempotencyKey(key)` | `findUnique` on the unique column (`src/repositories/workflow-run-repository.ts:87-101`). **No** visibility filter. The key already includes the user id |
| 54-56 | early return | returns the row with `steps`, `approvals`, and `events` included |
| 58 | `findActiveWorkflowVersionForDefinition(id)` | the highest `versionNumber` with status `ACTIVE` (`src/repositories/workflow-definition-repository.ts:56-64`). Not scoped to the caller |
| 60-62 | `ApiError(404)` | |
| 64 | `workflowDefinitionSchema.parse(...)` | a Zod failure here becomes 500 through `jsonError` |
| 66-77 | `$transaction` → `createWorkflowRun(tx, ...)` | `input` is stored as both `input` and `context` (72-73) |
| 80-83 | `seedRunExecution` | separate transaction, in the engine service |
| 85 | `findWorkflowRunById(id, user)` | visibility-scoped (`workflow-run-repository.ts:47-85`). Includes `startedBy`, step tasks and approvals, and events |
| 87-89 | `ApiError(500)` | |

Note that the early-return shape (line 55) and the fresh-create shape (line 91) come from **different** repository includes. A client that reads `startedBy` gets it on the first call but not on a replay.

## Ownership

- **Route:** session, permission, body shape.
- **Service:** idempotency, version freezing, transaction scope, reload.
- **Repository:** persistence plus visibility. `buildRunVisibilityWhere` lets every role except `VIEWER` read all runs (17-24, `canReadAllRuns` at `permissions.ts:42-44`).
- **Engine:** `seedRunExecution` and step scheduling (`src/services/workflow-engine-service.ts`).
- **Database:** `WorkflowRun.idempotencyKey` is `@unique` (`prisma/schema.prisma:186`). That is the only thing that can settle a concurrent duplicate.

## Exercise

**Goal:** Write the exact call list for a first start by `u1` with key `k`, and the list for its replay.
**Check:** The first start produces `lookup, version, parse, tx, create, tx-done, seed, reload`. The replay produces only `['lookup', 'u1:k']`. Both lists are asserted in `tests/workflow-run-idempotency.test.mjs:24` and `:26`.
