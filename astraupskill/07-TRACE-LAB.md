# Trace lab

## Service-level traces

Predict the "Trace prefix" and "Durable result" columns before you open `tests/workflow-run-idempotency.test.mjs`.

| Scenario | Trace prefix | Durable result | Error or result | Test line |
|---|---|---|---|---|
| first start (`u1`, `k`) | lookup, version, parse, tx, create, tx-done, seed, reload | run `u1:k`, seeded | the reloaded run | 24-25 |
| same-user replay | lookup | unchanged | the old row | 26 |
| different user | lookup, version, parse, tx, create, tx-done, seed, reload | new row `u2:k` | the new row | 27 |
| missing version | lookup, version | none | 404 | 30 |
| parse failure | lookup, version, parse | none | the original error | 33 |
| seed failure | lookup, version, parse, tx, create, tx-done, seed | one unseeded row | the original error | 36 |
| replay after seed failure | lookup | unchanged (still unseeded) | the stuck row | 37 |
| missing reload | full create and seed, then reload | one row | 500 | 40 |

The `tx-done` marker comes before `seed`. That is the transaction-scope lesson: a seed failure is not a creation rollback.

## Database-level trace (not executable in the lab)

Two concurrent first requests, A and B, by the same user with the same key:

| Step | A | B |
|---|---|---|
| 1 | lookup: none | lookup: none |
| 2 | version and parse | version and parse |
| 3 | insert `u1:k`, commit | insert `u1:k`, blocks on the unique index |
| 4 | seed, reload, 201 | unique violation, so `jsonError` returns 500 |

Annotate step 4 for B with `src/lib/api/route-helpers.ts:55-60`.

## HTTP view (read from source)

| Request | Status |
|---|---|
| no `tl_session` cookie | 401 (`route-helpers.ts:32-34`) |
| `VIEWER` or `APPROVER` session | 403, because they lack `runs:start` |
| `idempotencyKey: "abc"` (too short) | 500, because a `ZodError` is not an `ApiError` |
| a valid first start | 201 |
| a valid replay | 201 |

## Exercise

**Goal:** Extend the table with a row for "the definition is retired between the first call and the replay".
**Check:** The prefix is `lookup` and the result is the old row. Retirement is invisible to replays because of the early return at `workflow-run-service.ts:54-56`. Add it as a lab case (see chapter 04).
