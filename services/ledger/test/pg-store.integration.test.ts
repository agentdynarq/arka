/**
 * Runs against a real Cell 1 Postgres, the one docker-compose.yml brings up.
 * Skips with a clear reason rather than failing when nothing is listening, so
 * CI (which does not yet run Postgres, see the note left in arka-ops/TASKS.md
 * for lane B) stays green. Bring the stack up locally with `docker compose up`
 * to actually exercise this suite.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

import { PgLedgerStore, isPostgresReachable } from '../src/pg-store.ts'
import { LedgerConflictError } from '../src/store.ts'
import { appendBlock } from '../src/ledger-core.ts'
import type { Entry } from '../src/ledger-core.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

function transfer(from: string, to: string, amount: bigint): Entry[] {
  return [
    { account: from, direction: 'debit', amount },
    { account: to, direction: 'credit', amount },
  ]
}

const reachable = await isPostgresReachable(CONNECTION_STRING)

describe(
  'PgLedgerStore, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let store: PgLedgerStore

    before(async () => {
      store = new PgLedgerStore(CONNECTION_STRING)
      await store.resetSchema()
    })

    after(async () => {
      await store.close()
    })

    test('an empty store has no head and zero count', async () => {
      assert.equal(await store.head(), null)
      assert.equal(await store.count(), 0)
    })

    test('appends and reads back a block unchanged', async () => {
      const block = appendBlock(null, transfer('a', 'b', 12_345_67n), '2066-01-01T00:00:00.001Z')
      await store.append(block, null)

      const head = await store.head()
      assert.deepEqual(head, block)
      assert.equal(await store.count(), 1)
    })

    test('rejects an append against a stale expected head', async () => {
      const head = await store.head()
      const stale = appendBlock(null, transfer('a', 'b', 1n), '2066-01-01T00:00:00.002Z')

      await assert.rejects(
        () => store.append(stale, null),
        (e: unknown) => e instanceof LedgerConflictError && e.actualHeadSeq === head!.seq
      )
      assert.equal(await store.count(), 1, 'the rejected append must not have landed')
    })

    test('two concurrent appends against the same head: exactly one wins', async () => {
      const head = await store.head()
      const a = appendBlock(head, transfer('b', 'c', 10n), '2066-01-01T00:00:01.000Z')
      const b = appendBlock(head, transfer('b', 'd', 20n), '2066-01-01T00:00:02.000Z')

      const results = await Promise.allSettled([
        store.append(a, head?.seq ?? null),
        store.append(b, head?.seq ?? null),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      assert.equal(fulfilled.length, 1, 'exactly one concurrent append should land')
      assert.equal(rejected.length, 1)
      assert.ok(
        (rejected[0] as PromiseRejectedResult).reason instanceof LedgerConflictError,
        'the loser must fail with LedgerConflictError, not an unhandled Postgres error'
      )
    })

    test('read respects a range and preserves seq order', async () => {
      for (let i = 0; i < 3; i++) {
        const head = await store.head()
        await store.append(appendBlock(head, transfer('x', 'y', 1n), `2066-01-01T00:00:1${i}.000Z`), head?.seq ?? null)
      }

      const all = await store.read()
      assert.ok(all.length >= 4)
      for (let i = 1; i < all.length; i++) {
        assert.equal(all[i]!.seq, all[i - 1]!.seq + 1)
      }

      const slice = await store.read({ from: all[0]!.seq, to: all[0]!.seq })
      assert.equal(slice.length, 1)
      assert.equal(slice[0]!.seq, all[0]!.seq)
    })

    test('entries survive the round trip as bigint, not a rounded float', async () => {
      const head = await store.head()
      const huge = 9_007_199_254_740_993n // Number.MAX_SAFE_INTEGER + 2
      const block = appendBlock(head, transfer('e', 'f', huge), '2066-01-01T00:01:00.000Z')
      await store.append(block, head?.seq ?? null)

      const stored = await store.head()
      assert.equal(stored!.entries[0]!.amount, huge)
      assert.equal(typeof stored!.entries[0]!.amount, 'bigint')
    })
  }
)
