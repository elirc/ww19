# Verification and limits

## 1. Recorded by the original Astra run (not re-run for this revision)

[evidence/results.json](evidence/results.json) records:

- command `node --experimental-vm-modules --test tests/workflow-run-idempotency.test.mjs`
- five tests, all passing; elapsed 7.91 s; started 2026-09-22T03:21:46Z
- `cwd` was a staging directory on the author's machine (`...\stage\34942f670f85`), not this clone

The log it names, `crud-b05-astra-runtime.log`, is **not committed**. The earlier "captured output" link does not resolve here.

The recorded limits, still accurate:

1. The five cases execute the actual start-run service and `ApiError`. The repositories, transaction, schema, and engine are doubles, plus unused Next and auth stubs. No native Prisma, HTTP, real schema validation, worker, or concurrency was run.
2. The fixture models per-user stored keys, not database uniqueness. The create callback completes before seeding. After a seed failure, a replay returns the existing row without reseeding, and recovery was not added.
3. The same user and key return the existing run even when the payload or definition differs. No payload-binding guarantee and no production behavior change is claimed.

## 2. Confirmed by reading this clone

- `src/services/workflow-run-service.ts` is byte-identical to `astraupskill/snapshots/workflow-run-service.ts.original.txt`.
- The test file has five `test(...)` calls, at lines 23, 29, 32, 35, and 39.
- `WorkflowRun.idempotencyKey` is `@unique` (`prisma/schema.prisma:186`).
- `runs:repair` is declared (`src/lib/auth/permissions.ts:18`) and granted to `ADMIN` and `OPERATOR`, but no route or service checks it.
- `seedRunExecution` runs its own `$transaction` (`src/services/workflow-engine-service.ts:367`).

## 3. Never executed, as far as the repo records

- `npm test` (four colocated Vitest files)
- `prisma migrate` against `prisma/migrations/202604121613_init/migration.sql`, or the seed
- the worker (`src/worker/index.ts`)
- any HTTP request; the statuses in chapter 07 come from reading `route-helpers.ts`
- concurrent creates with the same key

## Before release

1. Add a provider-backed uniqueness race test, and map `P2002` to a replay.
2. Decide whether a same-user request with a changed payload should conflict, and if so store a fingerprint.
3. Add a repair path for `PENDING` runs with no steps, or move the seed into the creation transaction.
4. Re-run the lab and commit its log.
