# Trace lab

| Scenario | Trace prefix | Durable result | Error/result |
|---|---|---|---|
| same-user replay | lookup only | old row | old row |
| different user | lookup, version, parse, tx, create, seed, reload | new scoped row | new row |
| missing version | lookup, version | none | 404 |
| parse failure | lookup, version, parse | none | original error |
| seed failure | lookup, version, parse, tx, create, tx-done, seed | one row | original error |
| missing reload | full create and seed, reload | one row | 500 |

The table makes transaction scope visible. `tx-done` precedes seed, so seed failure is not creation rollback. It also shows why replay prevents duplicate seed work. Run [the test](../tests/workflow-run-idempotency.test.mjs) and compare payload and call assertions. A real database trace would add unique index outcomes and isolation; the adapter does not prove those.