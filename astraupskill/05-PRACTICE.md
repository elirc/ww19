# Graduated practice

Each level has a **Goal** and a **Check**. For every answer, name the actor, the scoped key, the first side effect, and whether a retry is safe.

**Level 1: same-user replay with a changed payload**
*Goal:* `u1` retries key `k` with a different `displayName`. Predict the calls, the returned id, and whether the seed runs.
*Check:* `['lookup', 'u1:k']` only. The same run object is returned, with the original display name, and the seed does not run (test line 26).

**Level 2: different user, same key**
*Goal:* `u2` submits key `k`. Predict the stored key.
*Check:* `u2:k`, a second row (test line 27). This is correct, because keys are per user.

**Level 3: missing active version**
*Goal:* Predict whether parse, transaction, create, or seed runs.
*Check:* None of them. The calls are `lookup, version`, then 404 (test line 30).

**Level 4: seed failure**
*Goal:* Predict the persisted rows and the next retry's trace.
*Check:* One `PENDING` run with no steps. The retry is `['lookup', 'u1:k']` and returns the stuck run (test lines 36-37). Then name the code that would repair it. There is none: `runs:repair` is unused outside `src/lib/auth/permissions.ts`.

**Level 5: missing reload**
*Goal:* Predict the response and the number of creates.
*Check:* 500 `"Workflow run was created but could not be reloaded."`, with exactly one create (test line 40). Also explain why the reload can return `null` in production: the run was committed and seeded, so a `null` would need the row deleted in between, or a visibility mismatch. Because the caller is the starter, `startedById` always matches.

**Level 6: concurrent first requests**
*Goal:* Two requests from `u1` with key `k` arrive together. Predict both responses with the current code.
*Check:* One returns 201 with the new run. The other fails on `@unique` (`prisma/schema.prisma:186`), and `jsonError` turns the Prisma error into a 500 (`src/lib/api/route-helpers.ts:55-60`).

**Level 7: response shape drift**
*Goal:* Compare the fields a client receives on a first call and on a replay.
*Check:* The first call uses `findWorkflowRunById` (includes `startedBy`, steps with `task` and `approval.decisions`, and `events`, `workflow-run-repository.ts:53-83`). The replay uses `findWorkflowRunByIdempotencyKey` (includes flat `steps`, `approvals`, and `events`, with **no** `startedBy`; lines 90-99). Propose one shape for both.

**Level 8: design**
*Goal:* Assign each guarantee to a layer: per-user key uniqueness, payload-mismatch detection, run-and-first-step atomicity, and stuck-run repair.
*Check:* Uniqueness belongs to the schema index. Mismatch detection is a service comparison against a stored fingerprint. Atomicity needs the service and engine to share one transaction, or an outbox. Repair is a new `runs:repair` route that re-calls `seedRunExecution` for a `PENDING` run with no steps.
