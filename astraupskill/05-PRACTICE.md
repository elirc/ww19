# Graduated practice

**Level 1:** Same user retries key `k` with a changed display name. Predict calls, returned id, and whether seed runs.

**Level 2:** User u2 submits key `k`. Predict the stored idempotency key and why a second row is correct.

**Level 3:** Active version is missing. Predict whether parse, transaction, create, or seed runs.

**Level 4:** Seed throws after transaction completion. Predict persisted row count and the next retry trace.

**Level 5:** Reload returns null after seed. Predict the response error and creation count. Then design a live uniqueness race and a payload-fingerprint conflict policy. Explain which guarantees belong to schema, repository, service, and engine. Record expected calls before checking the separate solutions. For each answer, name the actor, scoped key, first side effect, and whether a retry is safe, so the reasoning remains operationally useful.
 Include the exact call sequence and explain which committed records a reviewer should inspect after each failure.
