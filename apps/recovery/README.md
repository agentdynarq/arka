# @arka/recovery-app

HTTP adapter for the Recovery Console's control plane. Thin on purpose: everything that decides whether
a quarantine request is legitimate lives in `@arka/recovery`.

## Running it

```bash
docker compose up            # from the repo root, brings up both Cells plus the control-plane Postgres
pnpm --filter @arka/recovery-app build
pnpm --filter @arka/recovery-app start
```

Reads `CONTROL_PLANE_DATABASE_URL` (falls back to the local compose port), `CELL_IDS` (same variable
`apps/gateway`'s Cell Router reads), each Cell's `CELL<N>_POSTGRES_*` / `CELL<N>_REDIS_*` variables (same
naming `docker-compose.yml` uses), and `RECOVERY_PORT` (default `3002`).

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/recovery/health-map` | FR-21. Every configured Cell's live status |
| GET | `/v1/recovery/quarantine/:cellId` | Current quarantine state for one Cell |
| POST | `/v1/recovery/quarantine/request` | FR-22. Requester counts as the first of two approvals |
| POST | `/v1/recovery/quarantine/approve` | A second, distinct operator finalises the quarantine |
| POST | `/v1/recovery/quarantine/lift/request` | The reversal, same dual-approval mechanism |
| POST | `/v1/recovery/quarantine/lift/approve` | A second, distinct operator finalises the lift |
| GET | `/v1/recovery/audit-trail` | FR-25. Every recorded operator action, oldest first |
| GET | `/v1/recovery/audit-trail/verify` | Walks the chain from genesis, reports the first break if any |

## Tests

`test/http.integration.test.ts` boots the actual compiled app and calls it over real HTTP, same pattern
as `apps/gateway` and `apps/identity`. It overrides `RecoveryService` with an in-memory-backed instance
rather than touching Postgres: storage correctness is already proven against a real database by
`services/recovery/test/pg-stores.integration.test.ts`. This file's job is the HTTP boundary and the full
journey wired together for real: request, a lone requester failing to quarantine, a second distinct
operator finalising it, the health map reflecting the override while the other Cell stays healthy, the
audit trail recording it and verifying clean, and lifting requiring dual approval in reverse.
