# Concepts: identity, idempotency, and transaction scope

## 1. An idempotency key identifies a command, not its content

The key answers one question: is this the same command, retried? Here it is scoped per user, `${user.id}:${input.idempotencyKey}` (`src/services/workflow-run-service.ts:51`).

- Two users can both use `k` and get two runs (`u1:k`, `u2:k`). Test line 27 asserts this.
- One user replaying `k` gets the original run back, even with a different `displayName` or `input` (test line 26).

That is deliberate request identity, not payload equality. If the product needs "same key, different payload → 409", the run has to store a request fingerprint (for example a hash of the canonical body), and the replay branch has to compare it.

## 2. Check-then-create, and the database backstop

Lookup (line 52) and create (line 67) are separate statements. Two simultaneous first requests with the same key can both see "no row" and both reach `createWorkflowRun`. One insert wins. The other fails on the unique index for `idempotencyKey` (`prisma/schema.prisma:186`), and Prisma raises a unique-constraint error. `jsonError` does not recognize it, so the losing client gets **500** (`src/lib/api/route-helpers.ts:55-60`), not the replay it expected. The usual fix is to catch the unique violation and re-read the winner's row.

## 3. Two transactions, not one

Creation commits inside its own `$transaction` (66-77). Seeding runs afterwards in a separate transaction (`src/services/workflow-engine-service.ts:367-381`). Consequences:

- A seed failure leaves a committed `PENDING` run with no `RUN_CREATED` event and no first step.
- A replay returns that run **without** re-seeding (54-56).
- The service comment (line 79) says the early commit leaves "a durable record to repair". The permission `runs:repair` exists (`src/lib/auth/permissions.ts:18`), but no route or service uses it, so the repair has to be designed.

The trade-off is a shorter creation transaction, paid for with a window in which a run exists but cannot progress.

## 4. Validation happens before any side effect

The version lookup and the definition parse both run before the transaction. A missing active version gives 404 with no writes, and a parse failure writes nothing (test lines 29-34). Because the replay branch returns before both, a replay **skips** validation entirely. That is correct for idempotency, but it means a definition retired after the first call does not affect replays.

## 5. Versions are frozen at start time

The run stores `workflowVersionId: activeVersion.id` (line 68). Activating a newer version later does not change in-flight runs. The `currentStepKey` comes from the parsed definition of **that** version (line 75).

## Self-check

**Goal:** `u1` sends key `k`, and seeding throws. Then `u1` sends `k` again. Predict the persisted rows and the second response.
**Check:** One `WorkflowRun` row with key `u1:k`, status `PENDING`, and no steps. The second call returns it via the early return, so it is a 201 with the stale run, and the seed does not run (test lines 35-38). Nothing tells the client the run is stuck.
