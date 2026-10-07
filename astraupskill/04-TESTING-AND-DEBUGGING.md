# Testing and debugging

## Read the trace first

Compare the recorded `calls` array with the expected sequence, and stop at the first difference:

- **A same-user replay reaches `version`:** the early return (lines 54-56) was removed or the scoped key changed.
- **A different user reuses `u1:k`:** the scoping at line 51 was dropped. That would let one user's key collide with another's.
- **`parse` happens after `tx`:** validation moved inside the transaction, so a bad definition would now open a transaction it has to abort.
- **`seed` appears before `tx-done`:** someone moved the seed inside the creation transaction. That changes the failure semantics (seed failure would roll back the run), so the docs and Case 4 must change with it.
- **More than one `create` after a missing reload:** a retry loop was added around reload.

## Harness details worth knowing

- `tests/helpers/load-typescript.mjs` resolves `@/` to `src/` and refuses any unstubbed bare import (line 49). The test stubs `next/server` because the real `ApiError` lives in `src/lib/api/route-helpers.ts`, which imports `NextResponse`.
- Error identity: Cases 3 and 4 assert `e === f.error`, so the injected error must come back unwrapped. Cases 2 and 5 assert `e.status`, which comes from the production `ApiError`.
- `fixture()` reloads the module every time it is called (line 8), so each test starts from a fresh `runs` map and fresh module state.

## What the lab does not prove

- **Uniqueness under concurrency.** The `Map` double is sequential. A provider-backed test should start two creates with the same scoped key behind a barrier, then assert exactly one row and decide what the loser receives.
- **Seed atomicity.** The real `seedRunExecution` writes an event and a step in its own transaction (`src/services/workflow-engine-service.ts:367-381`). The lab replaces it entirely.
- **Visibility on reload.** The `findWorkflowRunById` double filters by `startedById` only. The real one applies `buildRunVisibilityWhere`, which grants non-VIEWER roles access to everything.
- **HTTP behavior.** For example, a replay returns 201 rather than 200, and Zod errors become 500 (`route-helpers.ts:55-60`).

## Colocated Vitest tests

`npm test` covers `route-helpers.test.ts`, `definition-schema.test.ts`, `run-state-machine.test.ts`, and `workflow-run-repository.test.ts`. They are not part of the recorded evidence.

## Exercise

**Goal:** Add a sixth case showing that a replay skips validation.
**Check:** Start once (success). Then change the fixture so `findActiveWorkflowVersionForDefinition` returns `null` (a retired definition), and start again with the same key. The call list is `['lookup', 'u1:k']` and the original run is returned, not a 404.
