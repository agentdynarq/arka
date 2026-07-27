# @arka/accounts

Accounts for one Cell. Owns FR-06 (real-time balances and transaction history) and FR-08 (ledger
confirmation status per transaction).

**Never touches the ledger's storage.** Every balance and history line comes from calling
`@arka/ledger`'s public methods (`balanceOf`, `history`), the same boundary any other consumer of the
ledger crosses. This service's own Postgres schema (`accounts`, in `src/schema.sql`) holds only what
the ledger has no concept of: which customer an account belongs to, and its display name. See
`docs/ARCHITECTURE.md` section 1, "database-per-service is enforced by schema separation."

## Running it

```bash
npm test         # unit tests always run; the Postgres suite skips without a live database
npm run typecheck
```

Bring up `docker compose up` from the repo root first to also exercise `pg-registry.integration.test.ts`
against a real Cell 1 Postgres.

## API

```ts
open(accountId, customerId, displayName): Promise<Account>
summary(accountId): Promise<AccountSummary>                      // balance, sourced live from the ledger
summariesForCustomer(customerId): Promise<AccountSummary[]>
history(accountId, limit?): Promise<TransactionHistoryEntry[]>    // newest first, FR-08 status on each line
```

### Why `confirmed` is always `true`

A ledger write is one synchronous transaction against the Cell's own Postgres. If a record can be read
back at all, it was durably committed, there is no partially-written state for a single entry to be in.
A multi-step saga (Payments, FR-13) can still be mid-flight, but that is a property of the saga
orchestrating several ledger writes, not of any individual entry once it exists. `TransactionHistoryEntry.confirmed`
is typed as the literal `true` for the same reason `reVerificationResult.livenessSimulated` is typed as
the literal `true` in `packages/contracts`: it should be a type error, not a convention, to represent an
entry as unconfirmed when this design cannot produce one.

### Naming a transfer's counterparty

`@arka/ledger`'s `LedgerRecord` carries `blockEntries`, every entry in the block that sealed the queried
one, not only the match. A block balances, so a two-party transfer's other side is always present.
`toHistoryEntry` finds the other account; if there is exactly one, that is the counterparty hint. If a
block ever touches more than one other account, the hint says `(multiple parties)` rather than
guessing which one to show, tested directly in `test/service.test.ts`.

## Tests

| Suite | Covers |
|---|---|
| `service.test.ts` | Open, duplicate rejection, live balance (never cached), per-customer listing, history ordering and limits, counterparty naming, the multiple-parties fallback |
| `pg-registry.integration.test.ts` | The same open/get/list behaviour against a real Postgres, including the unique-account-id constraint |

`service.test.ts` composes `AccountsService` with `InMemoryAccountRegistry` and a real `LedgerService`
backed by `InMemoryLedgerStore` from `@arka/ledger`, so a balance test genuinely proves the composition,
not a mock standing in for it.
