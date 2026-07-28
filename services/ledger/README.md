# @arka/ledger

The ledger service for one Cell. Owns FR-06 (balances and history), FR-08 (ledger confirmation
status) and FR-23 (integrity verification with export).

**Framework-free core.** `LedgerService` is plain TypeScript with no HTTP framework, no ORM, no
NestJS decorators. The eventual HTTP controller is a thin adapter that calls this class and serialises
its results. That split is what lets the behaviour that actually matters, correct recording,
concurrency safety, verification, get tested without a server or a database running.

## Running it

```bash
npm test         # 15 tests, in-memory store, nothing installed beyond Node 22
npm run typecheck
```

## Shape

```
src/
  ledger-core.ts   the single import point for @arka/ledger-core
  store.ts         LedgerStore port and LedgerConflictError
  memory-store.ts  in-memory implementation, used by tests and the seed script
  service.ts       LedgerService: the actual behaviour
```

`ledger-core.ts` exists so that every other file in this service imports the ledger primitives from
one place. Right now it is a relative path into `packages/ledger-core/src`, because the pnpm workspace
does not exist yet. Once it does, this file becomes a re-export of `@arka/ledger-core` and nothing
else in the service changes.

## What `LedgerService` does

```ts
record(entries, at?, validate?): Promise<Block>   // seal entries into the chain
verify(options?: { upTo? }): Promise<VerifyResult> // walk from genesis, report the first break
evidence(options?): Promise<IntegrityEvidence>     // verify() plus cell id and timestamp
balanceOf(account): Promise<bigint>
balances(): Promise<Map<string, bigint>>
history(account, limit?): Promise<LedgerRecord[]>  // newest first, each carries its sealing hash
```

### Optimistic concurrency, not a lock

`record` builds a block against the current head, then asks the store to append it only if the head
has not moved. If another writer won the race, the store throws `LedgerConflictError`, `record`
rebuilds the block against the new head and retries, up to `maxAppendAttempts` (default 5).

This is why there is a race-condition test in `test/service.test.ts` rather than only a happy path:
`record rebuilds and retries when another writer wins the race` uses a store wrapper that deliberately
lets a second write land between reading the head and appending, and asserts both writes survive in
the right order. A ledger service without this guarantee would silently drop one of two concurrent
transfers, which is precisely the class of bug a bank cannot ship.

Validation failures are never retried. An unbalanced block is unbalanced regardless of where in the
chain it lands, so `record` throws immediately rather than burning attempts.

### `validate`: a business rule checked against the state that will actually exist

The optional third argument runs against a freshly read chain on every attempt, including retries
after a losing race, not once before the first attempt. `@arka/payments` passes one that recomputes
the sender's balance and today's spend from that same fresh read, closing a real bug found live: two
individually valid concurrent transfers from the same account used to both pass a balance check read
once beforehand, and both land, overdrawing the account (`services/payments/README.md` has the full
repro). A `validate` failure throws immediately, the same as a structural validation failure: a fresh
read that fails is already a genuine failure at that attempt, not a stale one worth retrying.

### Verification always starts at genesis

`upTo` limits how far verification runs, but the walk always begins at block 0. Verifying a slice out
of the middle would prove only that the slice is internally consistent, a materially weaker claim than
"nothing since the beginning has been altered." The test `upTo limits how far verification runs but
still starts at genesis` checks this directly.

### Evidence is exportable

`evidence()` wraps `verify()` with the Cell id and a timestamp so the Recovery Console (FR-23, screen
W6) has something to export rather than a bare boolean. It round-trips through `JSON.stringify` and
back, which is asserted in a test, since evidence that cannot survive being written to a file is not
evidence.

## The `LedgerStore` port

```ts
head(): Promise<Block | null>
append(block, expectedHeadSeq): Promise<void>   // throws LedgerConflictError on a stale head
read(range?): Promise<Block[]>
count(): Promise<number>
```

`InMemoryLedgerStore` is used by unit tests. `PgLedgerStore` is the real implementation, one instance
per Cell, backed by that Cell's own Postgres database and its own `ledger` schema (`src/schema.sql`).

### `PgLedgerStore`: the primary key is the concurrency control

```ts
new PgLedgerStore(connectionString)   // takes a connection string, not a Pool: pg stays internal
```

`seq` is the table's primary key. Two writers racing to append the next block both compute the same
next sequence number from the head they read, so whichever `INSERT` loses the race hits a unique
violation (Postgres error `23505`), which `append` catches and turns into `LedgerConflictError`. No
separate "current head" row, no explicit lock, the constraint the database already enforces for free
is the whole mechanism. `LedgerService.record` (see above) is what rebuilds and retries on that error.

`at`, `prev_hash` and `hash` are stored as `text`, not `timestamptz`. The block's hash covers the exact
string `ledger-core` was given; round-tripping through a typed timestamp column risks recovering a
string that recomputes to a different hash than the one that sealed the block. Storing the literal
string removes that risk rather than trusting the driver's round trip.

`test/pg-store.integration.test.ts` runs against the real Cell 1 Postgres from `docker-compose.yml`.
It skips, with a clear reason rather than a failure, when nothing is listening, so CI stays green until
a Postgres service is added there. Bring the stack up with `docker compose up` from the repo root to
actually exercise it, including the concurrency test, which races two real inserts against the same
head and asserts exactly one wins.

See `docs/RUNBOOK.md` P1 for how `verify()` backs the operator's integrity audit procedure, and
`packages/ledger-core/README.md` for the primitives this service wraps. `scripts/verify-ledger.ts` and
`scripts/seed.ts` at the repo root are the CLI forms of this service.
