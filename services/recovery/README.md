# @arka/recovery

The Recovery Console's control plane, for one Arka deployment (not one Cell: this is the one service
that legitimately knows about more than one). Owns FR-21 (live Cell health), FR-22 (quarantine with dual
approval) and FR-25 (the append-only operator audit trail).

Framework-free, same reasoning as `@arka/ledger`, `@arka/accounts`, `@arka/payments` and
`@arka/identity`: the behaviour that decides whether a quarantine request is legitimate is testable
without a server or a database. `apps/recovery` is the thin HTTP adapter.

A separate trust zone from the data plane (see `docs/ARCHITECTURE.md` section 1): this service holds no
customer data, only operator actions and Cell health observations, and lives in its own control-plane
Postgres, never a Cell's database.

## Running it

```bash
npm test         # unit tests always run; the Postgres suite skips without a live database
npm run typecheck
```

Bring up `docker compose up` from the repo root first to also exercise `pg-stores.integration.test.ts`
against the real control-plane Postgres.

## FR-22: quarantine with dual approval

`docs/RUNBOOK.md` procedure P2. `QuarantineStore` (`src/quarantine-store.ts`) is deliberately dumb
storage, one row per Cell, with no notion of "dual approval": that logic lives once in
`RecoveryService` and runs identically over `InMemoryQuarantineStore` and `PgQuarantineStore`, the same
separation `SessionStore` keeps in `@arka/identity`.

The state machine: `requestQuarantine` moves a Cell from `'none'` to `'pending_second_approval'`,
recording the requester as the first of two required approvals. `approveQuarantine` requires a second,
**distinct** operator; the same operator calling twice is rejected, not silently accepted. The moment a
second distinct approver is recorded, the Cell moves to `'quarantined'`. Lifting a quarantine
(`requestLiftQuarantine` / `approveLiftQuarantine`) is the same dual-approval mechanism in reverse, per
the Runbook's "Reversing" note.

Every transition is one atomic SQL statement whose `WHERE` clause encodes its own precondition
(`PgQuarantineStore.startPending` / `addApprover`), the same one-statement-decides-everything style as
`PgSessionStore.claimRefreshToken` in `@arka/identity` and `PgLedgerStore.append` in `@arka/ledger`. Two
operators approving at the same instant cannot both be treated as the second, distinct approver: whichever
`UPDATE` commits first wins, and the second re-evaluates its `WHERE` clause against the now-committed row.

`QuarantineStatus.state` is `'pending_second_approval'` for both a pending quarantine and a pending lift,
honestly: both genuinely are pending a second approval. Which direction is internal bookkeeping
(`QuarantineRow.direction`), not part of the wire contract in `packages/contracts`.

## FR-21: live Cell health

`InfrastructureCellHealthChecker` (`src/cell-health.ts`) checks Postgres and Redis reachability per
Cell, timed. `isRedisReachable` (`src/redis-health.ts`) is a new sibling to `isPostgresReachable` in
`@arka/ledger`: same one-second bounded probe on its own connection, so a health check can never itself
exhaust a shared pool.

Quarantine is not an infrastructure fact and is deliberately layered on top by `RecoveryService.healthMap`,
not folded into the checker: a quarantined Cell always reports `'quarantined'` regardless of how healthy
its database looks, because the point of quarantine is that the Cell stops serving writes by operator
decision, not because its infrastructure failed.

## FR-25: the operator audit trail

`src/audit-hash.ts` reuses the ledger's hash-chain **primitive**, not its money-specific types: `Entry`
requires a `direction` and a strictly positive `amount`, and a block must balance, none of which
describes "operator X requested quarantine of cell-1". What is genuinely shared, `GENESIS_PREV_HASH` and
the `VerifyResult` wire shape, is imported directly from `@arka/ledger-core` rather than redefined.
`AuditTrailStore` mirrors `LedgerStore` exactly: append-only, optimistic concurrency on `seq`, a
unique-key collision on `INSERT` becomes `AuditTrailConflictError`, and `RecoveryService` retries against
the new head, identical to `LedgerService.record`.

Every quarantine and lift transition, requested or approved, appends one audit record. `verifyAuditTrail`
walks the chain from genesis and reports the first break, same contract as `LedgerService.verify`.

## Tests

| Suite | Covers |
|---|---|
| `audit-hash.test.ts` | Linking, an empty chain, tamper detection with the correct index, truncation's known limitation |
| `service.test.ts` | Full dual-approval flow for quarantine and lift, the same-operator-twice rejection, health map with the quarantine override, audit trail records every transition and verifies clean |
| `pg-stores.integration.test.ts` | The same storage behaviour against a real Postgres, including a genuine concurrent dual-approval race (two distinct operators approving at the same instant) fired with `Promise.all` |

`service.test.ts` composes `RecoveryService` with `InMemoryQuarantineStore` and `InMemoryAuditTrailStore`
and a fake `CellHealthChecker`, so the quarantine-overrides-health-map behaviour is proven against the
real composition, not a mock standing in for it.
