# @arka/payments

Payments for one Cell. Owns FR-09 (instant transfer) and FR-13 (idempotency: an interrupted or
retried payment is never executed twice). Saga orchestration for multi-step flows (QR acceptance,
agent cash-in/cash-out) is 29 July scope; this is the single-step transfer everything else builds on.

Framework-free, same reasoning as `@arka/ledger` and `@arka/accounts`: `PaymentsService` is composed
from their public methods, never their storage, so the behaviour that decides whether a transfer is
safe to retry is testable without a server or a database.

## Running it

```bash
npm test         # unit tests always run; the Postgres suite skips without a live database
npm run typecheck
```

## Idempotency (FR-13): the primary key is the concurrency control, again

The same pattern as `PgLedgerStore`'s `seq`, applied to idempotency keys. `reserve(key, fingerprint)`
is a single `INSERT ... ON CONFLICT DO NOTHING RETURNING *`. Exactly one caller ever inserts a row for
a given key; every other caller, whether truly concurrent or a later retry, is told it lost and is
handed the winner's result once the winner finishes.

```
transfer(request)
  reserve(key, fingerprint(request))
    claimed        -> execute the transfer, complete(key, result), return result
    not claimed
      fingerprint matches  -> wait for the claimant's result, return it
      fingerprint differs  -> throw, this key was already used for a different request
```

Three things worth knowing about this design:

**The fingerprint check exists so a reused key can never silently return a stale result for a request
that never ran.** Firing the same idempotency key with a different amount or a different destination
account is rejected outright rather than replayed, tested directly in `test/service.test.ts`.

**A failed attempt releases its claim.** If execution throws (insufficient funds, an unknown account),
the reservation is deleted so an identical retry actually re-executes rather than being stuck forever
on a key that can never complete. This only matters for the exact same request; a different request
needs a different key.

**A concurrent caller waiting for the claimant times out**, rather than waiting forever, guarding
against a claimant that crashed mid-flight. Configurable via `idempotencyWaitMs` (default 5000ms).

## Verified against real concurrency, not asserted

`test/service.test.ts`'s `the same key fired concurrently transfers money exactly once` fires two
identical `transfer()` calls with `Promise.all`, not sequentially, and asserts both resolve to the
same `transferId` and exactly one transfer block lands in the ledger. The equivalent test against
`PgIdempotencyStore` races two real `reserve()` calls against a live Postgres and asserts exactly one
wins.

An ad hoc end-to-end run against real seeded data confirmed it under load a database round trip
introduces: firing the same key concurrently moved exactly 50.00, not 100.00, and the ledger still
verified clean afterward.

## `PaymentsError` codes

| Code | When |
|---|---|
| `SAME_ACCOUNT` | `fromAccountId` equals `toAccountId` |
| `INSUFFICIENT_FUNDS` | The sender's live ledger balance is below the amount |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` | The same key was used for a materially different request |
| `IDEMPOTENCY_TIMEOUT` | Waited `idempotencyWaitMs` for a claimant that never completed |

Any other account lookup failure surfaces as `AccountsError` from `@arka/accounts`, unchanged, rather
than being wrapped: a caller already knows how to handle that error from using Accounts directly.
