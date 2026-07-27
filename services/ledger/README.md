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
record(entries, at?): Promise<Block>              // seal entries into the chain
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

`InMemoryLedgerStore` is the only implementation so far, used by tests and by the seed script. The
Postgres adapter that will back it in a real Cell needs to enforce the same optimistic-concurrency
contract, most naturally with a unique constraint on `(cell_id, seq)` and a conditional insert. A store
implementation that skips this is not a correctness detail, it is the difference between "two transfers
fired at once both land" and "one silently disappears."

See `docs/RUNBOOK.md` P1 for how `verify()` backs the operator's integrity audit procedure, and
`packages/ledger-core/README.md` for the primitives this service wraps.
