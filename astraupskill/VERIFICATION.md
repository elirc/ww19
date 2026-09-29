# Verification and limits

The expanded runtime lab executes the real `startWorkflowRun` service with explicit adapters and covers five scenarios: same-user replay versus changed payload, different-user scoped creation and exact payload, missing active version, parse failure before transaction, seed failure after committed creation with no retry seed, and missing post-seed reload returning 500. Run the project-specific recorded Node VM test command from the check artifacts.

The lab does not open Prisma, race concurrent creates, execute the real engine, or prove remote API idempotency. It verifies call ordering, user-scoped key behavior, create payload, error ordering, and replay after seed failure. The transaction intentionally ends before seed; that tradeoff is documented rather than hidden. Before release, add provider-backed uniqueness and rollback checks and decide whether same-user changed payloads should conflict. This chapter describes the executed service boundary and its limits honestly. Reviewers should keep those unexecuted guarantees separate from the passing service trace.

## Astra execution evidence

The captured focused production-source suite executed 5 tests: all passed, zero failed and zero skipped. Read the [captured output](evidence/crud-b05-astra-runtime.log) and [exact command and limits](evidence/results.json). Earlier check records remain preserved in the workspace.
