# @arka/payments

Payments for one Cell. Owns FR-09 (instant transfer), FR-11 (QR acceptance), FR-12 (daily limits
with step-up), FR-13 (idempotency: an interrupted or retried payment is never executed twice), and
FR-16 (agent cash-in/cash-out with OTP consent).

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

## A real overdraw, found live, closed the same way every other race here is

Idempotency (above) only protects the same request from executing twice. It says nothing about two
*different*, individually valid requests against the same account, and that gap was real: `#execute`
used to read the sender's balance and daily limit once via `AccountsService.summary`, before calling
`LedgerService.record`. `record` retries against a fresh head on a losing race, but it never re-checked
balance or limit on retry, those were only ever checked before the first attempt.

Found live, not by inspection (see `arka-ops/LOG.md`, 28 July): alice at 1000.00, two concurrent
transfers of 600.00 each to bob, different idempotency keys, fired as two parallel processes. Both
succeeded. Her balance afterward: -204.00.

Fixed by moving the check inside the retry loop itself: `LedgerService.record` now takes an optional
`validate` callback that runs against a freshly read chain on every attempt, not once beforehand.
`#execute` passes one that recomputes balance and today's spend directly from that same fresh read, so
a losing race that lands between this service's own read and its append gets checked against the state
that actually exists at append time, not a snapshot from before the race. A failure here throws
immediately, since a fresh read that fails is already a genuine failure, not a stale one worth retrying.

`test/service.test.ts`'s `two genuinely concurrent transfers that would jointly overdraw an account`
reproduces the live finding with `Promise.allSettled`: exactly one of the two 600.00 transfers lands,
the other is rejected `INSUFFICIENT_FUNDS`, and alice's balance is asserted to land at exactly 400.00,
never negative.

## FR-11: QR acceptance, without a saga

`generateQrPayload` signs a payload (merchant account, amount, reference, expiry) with HMAC-SHA256,
zero runtime dependencies, same reasoning as `@arka/workload-auth`. The canonical form is JSON, not a
hand-joined delimited string: an earlier draft used a plain string join and it silently produced an
unparseable token the first time it was actually exercised. `verifyQrPayload` checks the signature
before parsing anything, the same discipline `verifyWorkloadToken` uses, and distinguishes
`QR_EXPIRED` from `QR_SIGNATURE_INVALID` so a customer sees "this code expired" rather than "invalid
code" for the ordinary case of a stale scan.

`redeemQr` verifies the token, then delegates to `transfer()`, keyed on the caller's idempotency key.
No compensating action: a QR redemption is exactly one ledger append, already atomic. A saga only earns
its complexity when a single state change cannot be made atomic on its own; redeeming a QR is not that
case. Where a real saga would belong is a genuinely multi-step flow with more than one state change to
coordinate; nothing in this build's actual scope turned out to need one, agent cash-in/cash-out (FR-16)
included, see that section below.

Because redemption is a `transfer()` under the hood, it is automatically subject to the same balance
check and daily limit as any other transfer, tested directly in `test/service.test.ts`.

### A real race, closed the same way every other race in this codebase is

`signQrPayload` is pure: the same payload always signs to the same token. The first version of
`redeemQr` verified the token and delegated straight to `transfer()`, with no record that a given token
had ever been redeemed before. `transfer()`'s own idempotency protection only ever guards one key
against itself, so the same scanned code, submitted twice with two *different* idempotency keys (a
customer's client retrying without reusing the key, or the code genuinely scanned twice), looked like
two unrelated requests and could move money twice off one QR code. There was never really "no consumed
QR tokens table" in the sense that mattered; there just wasn't one yet.

Fixed with `QrRedemptionStore`, the same atomic-claim shape every other race in this codebase closes
with (`PgIdempotencyStore.reserve`, the quarantine dual-approval `UPDATE`, `AgentCashStore.consume`):
`claimOrGetOwner(tokenHash, idempotencyKey)` atomically inserts a claim for the caller's key if none
exists, and returns whichever key actually holds the claim. The caller compares the result to its own
key: equal means proceed (either the first redemption, or a genuine retry with the same key, which
still needs to work exactly like every other idempotent call here); different means someone already
redeemed this token, rejected as `QR_ALREADY_REDEEMED` before `transfer()` is ever called. Proven with a
sequential same-token-different-keys test, a genuine `Promise.allSettled` race between two different
keys, and a ten-way concurrent claim against real Postgres.

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

## FR-16: agent cash-in/cash-out, no new money-movement code either

`requestAgentCash` generates a 6-digit OTP and a pending request (its own store, `agent_cash_requests`,
same schema), returning the OTP to the caller. It is never delivered by this package: who tells the
customer (a notification, a display screen) is a decision for whatever composes Payments with a
delivery channel, the same separation `changeDailyLimit` keeps from verifying an actual step-up token.
`apps/identity`'s `AgentCashController` writes it into the customer's notification inbox and never
returns it to the agent in the HTTP response.

`completeAgentCash` verifies the OTP (`timingSafeEqual`, same reasoning as identity's TOTP compare),
consumes the request exactly once, then delegates to `transfer()`: `cash_in` credits the customer (the
agent received physical cash), `cash_out` debits the customer (the agent handed cash over). No new
money-movement code, no saga, the same "one ledger append is already atomic" reasoning `redeemQr` uses.

### A real race, closed the same way every other race in this codebase is

The first version of `AgentCashStore.consume` was a plain `get`-then-`set`, unconditional, returning
`void`. Two `completeAgentCash` calls for the same request with two *different* idempotency keys
(a genuine double-submit, not a retry with the same key) could both read `consumedAt: null` before
either wrote, both pass the check, and both proceed to a real transfer, one OTP spent twice. Caught
before it shipped a test, not in review: `consume` now atomically transitions `consumedAt` only if it
is still `null` and returns whether *this* call won, the identical shape `PgIdempotencyStore.reserve`
and the quarantine dual-approval `UPDATE` already use. A ten-way concurrent `consume` test against real
Postgres, and a two-different-idempotency-keys `completeAgentCash` race, both prove exactly one call
wins.

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
| `QR_ALREADY_REDEEMED` | The token was already redeemed, including by a concurrent call that won the race |
| `AGENT_REQUEST_NOT_FOUND` | `completeAgentCash` called with an unknown `requestId` |
| `AGENT_REQUEST_EXPIRED` | The OTP window (`agentCashTtlSeconds`, default 5 minutes) has passed |
| `AGENT_REQUEST_ALREADY_USED` | The request was already consumed, including by a concurrent call that won the race |
| `AGENT_OTP_INVALID` | The submitted OTP does not match |
| `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` | The same key was used for a materially different request |
| `IDEMPOTENCY_TIMEOUT` | Waited `idempotencyWaitMs` for a claimant that never completed |

Any other account lookup failure surfaces as `AccountsError` from `@arka/accounts`, unchanged, rather
than being wrapped: a caller already knows how to handle that error from using Accounts directly.
