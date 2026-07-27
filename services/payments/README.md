# @arka/payments

Payments for one Cell. Owns FR-09 (instant transfer), FR-11 (QR acceptance), FR-12 (daily limits
with step-up), and FR-13 (idempotency: an interrupted or retried payment is never executed twice).

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

## FR-11: QR acceptance, without a saga

`generateQrPayload` signs a payload (merchant account, amount, reference, expiry) with HMAC-SHA256,
zero runtime dependencies, same reasoning as `@arka/workload-auth`. The canonical form is JSON, not a
hand-joined delimited string: an earlier draft used a plain string join and it silently produced an
unparseable token the first time it was actually exercised. `verifyQrPayload` checks the signature
before parsing anything, the same discipline `verifyWorkloadToken` uses, and distinguishes
`QR_EXPIRED` from `QR_SIGNATURE_INVALID` so a customer sees "this code expired" rather than "invalid
code" for the ordinary case of a stale scan.

`redeemQr` verifies the token, then delegates to `transfer()`, keyed on the caller's idempotency key.
There is no separate "consumed QR tokens" table and no compensating action, because a QR redemption is
exactly one ledger append, already atomic. A saga only earns its complexity when a single state change
cannot be made atomic on its own; redeeming a QR is not that case. Where a real saga belongs is the
multi-step agent cash-in/cash-out flow (FR-16, 30 July scope), which genuinely has more than one
state change to coordinate.

Because redemption is a `transfer()` under the hood, it is automatically subject to the same balance
check and daily limit as any other transfer, tested directly in `test/service.test.ts`.

## FR-12: daily limits

`dailyLimit(accountId)` returns the account's live limit (an explicit override, or the platform
default) and `spentToday`, summed from today's outgoing ledger entries, the same "never cached"
reasoning as `AccountsService.summary`. Reads the account's full history rather than an indexed
date-range query, correct at Phase 2 demo scale, worth revisiting if an account's history grows large
enough for it to matter.

`changeDailyLimit` requires `stepUpVerified: true` on the request. This service never checks an actual
step-up token: verifying one is `@arka/identity`'s job, at whatever layer composes both services. This
method only enforces that the gate cannot be skipped, the same separation `LedgerService.record` keeps
from deciding what entries a caller should have chosen.

`transfer()` (and therefore `redeemQr()`) checks the limit alongside the balance: `spentToday + amount`
must not exceed the live limit, tested with two transfers that individually fit but together do not.

## FR-04: `isNewPayee`, the wireframe's step-up trigger

`isNewPayee(fromAccountId, toAccountId)` answers whether `toAccountId` has ever received a transfer
from `fromAccountId` before, by walking the sender's own ledger history for a prior debit whose block
also contains the candidate payee. It lives here rather than in whatever composes step-up verification
(`apps/identity`'s `TransfersController`, see docs/adr/0006) because it is a question about a sender's
own transfer history, the same kind of fact `dailyLimit`'s `spentToday` already answers from the
ledger. `transfer()` itself does not call it: whether a new payee requires step-up is a policy decision
made by the caller, the same shape `changeDailyLimit`'s `stepUpVerified` already uses, not something
baked unconditionally into every transfer.

## `PaymentsError` codes

| Code | When |
|---|---|
| `SAME_ACCOUNT` | `fromAccountId` equals `toAccountId` |
| `INSUFFICIENT_FUNDS` | The sender's live ledger balance is below the amount |
| `DAILY_LIMIT_EXCEEDED` | `spentToday + amount` exceeds the account's live daily limit |
| `STEP_UP_REQUIRED` | `changeDailyLimit` called without `stepUpVerified: true` |
| `INVALID_LIMIT` | A new daily limit that is not strictly positive |
| `QR_EXPIRED` | A scanned QR code's `expiresAt` has passed |
| `QR_SIGNATURE_INVALID` | A scanned QR code's signature does not match its contents |
| `QR_MALFORMED` | A scanned QR code is not shaped like one this service issued |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` | The same key was used for a materially different request |
| `IDEMPOTENCY_TIMEOUT` | Waited `idempotencyWaitMs` for a claimant that never completed |

Any other account lookup failure surfaces as `AccountsError` from `@arka/accounts`, unchanged, rather
than being wrapped: a caller already knows how to handle that error from using Accounts directly.
