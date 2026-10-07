# Worked flow

The useful before-and-after here is a **trace**, not a production patch. The service is byte-identical to `astraupskill/snapshots/workflow-run-service.ts.original.txt`. A learner reading the code for the first time might assume that a seed failure rolls back the run, or that a changed replay payload updates the original run. The lab shows that neither is true.

## The fixture (test lines 5-22)

- input: `{ workflowDefinitionId: 'd1', displayName: 'Example', idempotencyKey: 'k', input: { answer: 42 } }`
- the active version is `{ id: 'v1', definition }`, where `definition = { initialStepKey: 'start' }`
- `runs` is a `Map` keyed by idempotency key, and `createWorkflowRun` adds `id: 'run-' + runs.size`
- `$transaction` records `tx`, runs the callback with a shared `tx` object, then records `tx-done` (line 10). That marker is what makes "seed after commit" visible.
- Eight specifiers are stubbed (lines 9-19): `next/server`, `@/lib/auth/permissions`, `@/lib/auth/session`, `@/lib/db`, the definition schema, both repositories, and the engine service. The real `ApiError` comes from `@/lib/api/route-helpers`, which imports `next/server`, the session module, and the permissions module. That is why those three are stubbed even though the service does not use them directly.

## Case 1: first start, replay, different user (lines 23-28)

1. Calls: `lookup, version, parse, tx, create, tx-done, seed, reload`.
2. The create payload deep-equals `{ workflowVersionId: 'v1', startedById: 'u1', displayName: 'Example', idempotencyKey: 'u1:k', input: { answer: 42 }, context: { answer: 42 }, status: 'PENDING', currentStepKey: 'start' }`.
3. A replay with `displayName: 'Changed'` returns the **same object** as the first result, and the only call is `['lookup', 'u1:k']`.
4. `u2` gets a new id, the key `u2:k`, and `runs.size` becomes 2.

## Case 2: missing version (29-31)

404 (`e.status === 404`, the real `ApiError`). Calls: `lookup, version`. No rows.

## Case 3: parse failure (32-34)

The injected error propagates unchanged. Calls: `lookup, version, parse`. No rows.

## Case 4: seed failure, then replay (35-38)

Calls: `lookup, version, parse, tx, create, tx-done, seed`. One row exists. The replay returns `runs.get('u1:k')` with only a `lookup` call, so there is no second seed.

## Case 5: missing reload (39-41)

500, exactly one `create`, and `reload` is the last call.

## Exercise: make the losing concurrent create a replay

**Goal:** Change `startWorkflowRun` so that a unique-key collision returns the winner's run instead of a 500.
**Check:** (1) Wrap the `$transaction` (66-77) in `try/catch`. (2) In the catch, test for Prisma's unique-violation code `P2002`. (3) Re-run `findWorkflowRunByIdempotencyKey(scopedIdempotencyKey)` and return its result. (4) Add a lab case whose `createWorkflowRun` double throws `Object.assign(new Error('dup'), { code: 'P2002' })` after inserting a row under that key. Assert that the result is that row and that no `seed` call happens. (5) State in the PR that a real-database race test is still needed.
