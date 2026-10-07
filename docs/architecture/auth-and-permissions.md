# Auth And Permissions

## Session flow

Session creation starts in [src/app/api/auth/login/route.ts](../../src/app/api/auth/login/route.ts), where `POST()` parses `loginSchema`, calls `loginUser()` in [src/services/auth-service.ts](../../src/services/auth-service.ts), and sets the cookie from `buildSessionCookie()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts).

The cookie value is an opaque random token. `createSession()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) hashes that token before saving it in `model Session` in [prisma/schema.prisma](../../prisma/schema.prisma). `getUserFromSessionToken()` in the same file re-hashes the cookie value, resolves the session row, checks `expiresAt`, and returns the `User`.

Server-rendered pages are protected by `requirePageUser()` in [src/lib/auth/page-auth.ts](../../src/lib/auth/page-auth.ts), which calls `getPageSessionUser()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) and redirects to `/login` before rendering app pages.

## API authorization

API auth is centralized in `requireRequestUser()` in [src/lib/api/route-helpers.ts](../../src/lib/api/route-helpers.ts). Every protected route calls it before service logic. Example: `POST()` in [src/app/api/workflow-runs/route.ts](../../src/app/api/workflow-runs/route.ts) requires `permissions.runsStart` before calling `startWorkflowRun()`.

Role-to-permission mapping lives in [src/lib/auth/permissions.ts](../../src/lib/auth/permissions.ts):
- `ADMIN`: all permissions from `Object.values(permissions)`
- `OPERATOR`: reads workflows/runs and may start/repair runs
- `APPROVER`: reads workflows/runs and may resolve approvals
- `VIEWER`: reads workflows/runs only

This means a route like [src/app/api/approvals/[approvalId]/decision/route.ts](../../src/app/api/approvals/[approvalId]/decision/route.ts) is protected twice:
- `requireRequestUser(request, permissions.approvalsDecide)` blocks non-approvers before the service runs.
- `submitApprovalDecision()` in [src/services/approval-service.ts](../../src/services/approval-service.ts) re-checks `user.role !== "APPROVER" && user.role !== "ADMIN"` so the business rule stays server-side even if the UI is bypassed.

## Data isolation

This project does not implement multi-tenancy because the requirements did not call for org- or tenant-level isolation. Instead it uses explicit auth plus ownership-based read scoping for lower-privilege users.

Run read scoping is enforced in `buildRunVisibilityWhere()` inside [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts). `VIEWER` users get `{ startedById: user.id }`, while higher-privilege roles get `{}`. `listWorkflowRuns()` and `findWorkflowRunById()` both apply that helper before any run data is returned.

Approval visibility is enforced in `listPendingApprovals()` inside [src/repositories/approval-repository.ts](../../src/repositories/approval-repository.ts). `ADMIN` sees all pending approvals; other roles only see rows where `requiredRole` matches their role.

## What would change to add multi-tenancy later

To add tenant isolation without a rewrite:
- Add `tenantId` to `User`, `WorkflowDefinition`, `WorkflowVersion`, `WorkflowRun`, `WorkflowStepRun`, `WorkflowTask`, `ApprovalRequest`, and `ExecutionEvent` in [prisma/schema.prisma](../../prisma/schema.prisma).
- Extend `createSession()` and `getUserFromSessionToken()` in [src/lib/auth/session.ts](../../src/lib/auth/session.ts) to load tenant context.
- Replace `buildRunVisibilityWhere()` in [src/repositories/workflow-run-repository.ts](../../src/repositories/workflow-run-repository.ts) with a tenant-aware filter that always scopes `tenantId` first and then layers role/ownership rules on top.
- Update `listWorkflowDefinitions()` and `findActiveWorkflowVersionForDefinition()` in [src/repositories/workflow-definition-repository.ts](../../src/repositories/workflow-definition-repository.ts) so workflow definitions are tenant-owned instead of global.

## Exact locations and gaps

- Session lookup: `src/lib/auth/session.ts:47-71`. The cookie holds an opaque token, and the database stores only its SHA-256 hash (21-23, 25-40). Sessions expire after 7 days (line 19). Each authenticated request also writes `lastSeenAt` (65-68), so every read request costs one extra database write.
- Route guard: `requireRequestUser` (`src/lib/api/route-helpers.ts:28-41`). It returns 401 without a valid session and 403 when the role lacks the permission.
- Role matrix: `src/lib/auth/permissions.ts:24-35`. `canReadAllRuns` returns true for every role except `VIEWER` (42-44).

Gaps to review:

1. `runs:repair` is granted to `ADMIN` and `OPERATOR`, but no route or service checks it, so there is no repair surface for runs stranded by a failed seed.
2. Starting a run checks `runs:start` only. `findActiveWorkflowVersionForDefinition` is not scoped to the caller (`src/repositories/workflow-definition-repository.ts:56-64`), so any operator can start any active definition.
3. `APPROVER` can read every run through `buildRunVisibilityWhere`. Only `VIEWER` is restricted to runs they started.
