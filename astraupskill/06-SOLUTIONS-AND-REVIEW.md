# Solutions and review rubric

## Solutions

1. Level 1 stops after the lookup and returns the original row. A changed payload is ignored under the current semantics.
2. Level 2 stores `u2:k` and creates an independent run.
3. Level 3 stops at lookup and version with a 404. There is no parse and no transaction.
4. Level 4 propagates the seed error after `tx-done` and leaves one created run. A replay returns that run without seeding again. Repair is a missing feature.
5. Level 5 returns 500 after the reload, with exactly one create. Whether a reload should be retried is a separate design decision.
6. Level 6 produces one success and one 500. Map `P2002` to a re-read of the winning run.
7. Level 7: the two paths return different shapes. Pick `findWorkflowRunById(existing.id, user)` for both.
8. Level 8: see the Check under Level 8 in 05.

## Review rubric

1. The identity is user-scoped and documented as identity, not content.
2. The create payload is exact, including the frozen `workflowVersionId` and `currentStepKey`.
3. Parsing happens before the transaction.
4. The transaction visibly completes before the seed runs.
5. A replay does not create again.

Reject documentation that says "idempotent" without naming the key scope and the replay behavior.

## Senior review: findings across the repo

These come from reading this clone. None was reproduced against a database.

| # | Severity | Location | Finding |
|---|---|---|---|
| 1 | High | `src/services/workflow-run-service.ts:66-83`, `src/services/workflow-engine-service.ts:363-382` | Run creation and seeding are separate transactions. A seed failure leaves a permanently `PENDING` run with no steps. Replays return it without seeding, and no code uses `runs:repair` (`src/lib/auth/permissions.ts:18`). |
| 2 | Medium | `workflow-run-service.ts:52-77`, `prisma/schema.prisma:186` | Check-then-create. A concurrent duplicate gets a Prisma unique-constraint error, which `jsonError` maps to 500 (`src/lib/api/route-helpers.ts:55-60`) instead of a replay. |
| 3 | Medium | `workflow-run-service.ts:54-56` | Replays never compare payloads, so a client that reuses a key by mistake silently gets an unrelated earlier run. |
| 4 | Low | `workflow-run-service.ts:55` vs `:91` | The two code paths return different response shapes (repository includes differ). |
| 5 | Low | `src/app/api/workflow-runs/route.ts:35` | A replay answers 201 Created, the same as a fresh create. Clients cannot tell them apart. |
| 6 | Low | `src/repositories/workflow-definition-repository.ts:56-64` | Starting a run does not check the caller's access to that workflow definition. Any `runs:start` holder can start any active definition. |
| 7 | Low | `src/lib/api/route-helpers.ts:47-61` | `ZodError` is not handled specially, so a malformed body or a bad stored definition becomes a 500 rather than a 400. |
| 8 | Info | `src/repositories/workflow-run-repository.ts:17-24` | Every role except `VIEWER` reads every run, including `APPROVER`. Confirm this is intended. |

## Test blind spots

- No case for the unique-violation path (finding 2).
- No case shows that a replay skips validation for a since-retired definition.
- The seed double hides the engine's own transaction, so the "stuck run" state is described, not produced, by the lab.
