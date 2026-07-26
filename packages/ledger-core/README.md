# @arka/ledger-core

The append-only, hash-chained, double-entry ledger that is Arka's single source of financial truth.
Everything else in the platform is a rebuildable projection of what this package records.

**Zero runtime dependencies.** Nothing outside the Node standard library. It has no dependencies for
the same reason it is small: this is the code backing the boldest claim in the blueprint, so it should
be readable in one sitting and testable without any infrastructure.

## Running it

```bash
npm test        # 71 tests, no install required beyond Node 22
npm run typecheck
```

The test suite runs on Node's built-in test runner with native type stripping, so it needs nothing
installed to execute. Only the typecheck needs TypeScript.

## API

```ts
appendBlock(prev: Block | null, entries: readonly Entry[], at?: string): Block
verifyChain(blocks: readonly Block[]): VerifyResult
balanceOf(blocks: readonly Block[], account: string): bigint
balances(blocks: readonly Block[]): Map<string, bigint>
totalPosition(blocks: readonly Block[]): bigint
```

Pass `null` as `prev` to open a chain. `appendBlock` throws `LedgerError` rather than returning an
invalid block, because an unbalanced block should never reach storage.

```ts
import { appendBlock, verifyChain, balanceOf } from '@arka/ledger-core'

const genesis = appendBlock(null, [
  { account: 'bank:reserve',   direction: 'debit',  amount: 500_00n },
  { account: 'customer:alice', direction: 'credit', amount: 500_00n },
])

const next = appendBlock(genesis, [
  { account: 'customer:alice', direction: 'debit',  amount: 125_00n },
  { account: 'customer:bob',   direction: 'credit', amount: 125_00n },
])

verifyChain([genesis, next])           // { ok: true, records: 2, rootHash: '...' }
balanceOf([genesis, next], 'customer:alice')  // 375_00n
```

## The rules it enforces

- **Money is `bigint` in minor units.** Amounts are strictly positive and direction carries the sign.
  A float is rejected at runtime, not only by the type system, because the realistic route for one to
  arrive is a caller in untyped JavaScript.
- **Every block balances.** Debits equal credits, checked before the block exists.
- **The chain links.** `seq` increments by exactly one and `prevHash` matches the predecessor.
  Sixty-four zeros marks genesis, so a dropped first block is distinguishable from a real one.
- **Breaks are located, not just reported.** `verifyChain` returns the index of the first bad block
  and why it failed. An operator following the runbook under pressure needs both.

## Two design notes worth knowing

**The canonical form is length-prefixed, not delimited.** Each field is written as
`<byteLength>:<value>`. A delimited encoding has to forbid whichever character it delimits with, and
any such rule is one forgotten validation away from two different records sharing a hash. Prefixing
makes the encoding injective while letting account identifiers contain anything, including the
`customer:alice` namespacing used throughout the platform.

**Truncation is the one edit a hash chain alone cannot detect.** Deleting blocks from the end leaves a
shorter chain that still verifies. That is a property of the primitive, not a bug, and it is why root
hashes are published at checkpoints. There is a test asserting exactly this, because a documented
limitation is worth more than a silent one.

## Balance semantics

`balanceOf` returns credits minus debits, in minor units. For a customer deposit account, which is a
liability of the bank, that is the balance the customer sees: money in is a credit. Asset-side
accounts read the sign inversely, and interpreting that is the caller's job rather than this
package's.

Any stored balance is a projection. A projection that disagrees with `balanceOf` is wrong.

## Tests

| Suite | Covers |
|---|---|
| `append.test.ts` | Balance, positive bigint amounts, float rejection, account and timestamp validation, entry copying |
| `chain.test.ts` | Linkage, genesis, empty chains, gaps, reordering, determinism |
| `tamper.test.ts` | Every field altered at every position, and the partial cover-up case |
| `balance.test.ts` | Replay equals an incrementally built projection, exactness past float range, whole ledger sums to zero |
| `hash.test.ts` | Canonical form injectivity, length prefixing, multi-byte identifiers |

The tamper suite runs its cases at every index in the chain rather than a convenient one. A detector
that only catches edits to the last block would pass a looser test while being useless.

See `docs/adr/0002` for why the ledger is shaped this way.
