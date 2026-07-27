/**
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { isPostgresReachable } from '@arka/ledger'

import { PgIdempotencyStore } from '../src/pg-idempotency-store.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

const reachable = await isPostgresReachable(CONNECTION_STRING)

describe(
  'PgIdempotencyStore, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let store: PgIdempotencyStore<{ ok: true; value: number }>

    before(async () => {
      store = new PgIdempotencyStore(CONNECTION_STRING)
      await store.resetSchema()
    })

    after(async () => {
      await store.close()
    })

    test('an unknown key is null', async () => {
      assert.equal(await store.get('nope'), null)
    })

    test('reserve claims an unclaimed key', async () => {
      const outcome = await store.reserve('k1', 'fp-1')
      assert.equal(outcome.claimed, true)

      const record = await store.get('k1')
      assert.equal(record!.status, 'pending')
      assert.equal(record!.requestFingerprint, 'fp-1')
      assert.equal(record!.result, null)
    })

    test('a second reserve on the same key is told it lost, and sees the same fingerprint', async () => {
      await store.reserve('k2', 'fp-2')
      const second = await store.reserve('k2', 'fp-2')

      assert.equal(second.claimed, false)
      if (!second.claimed) {
        assert.equal(second.existing.requestFingerprint, 'fp-2')
      }
    })

    test('complete stores the result, visible to get', async () => {
      await store.reserve('k3', 'fp-3')
      await store.complete('k3', { ok: true, value: 42 })

      const record = await store.get('k3')
      assert.equal(record!.status, 'completed')
      assert.deepEqual(record!.result, { ok: true, value: 42 })
    })

    test('release removes a pending key so it can be reserved again', async () => {
      await store.reserve('k4', 'fp-4')
      await store.release('k4')

      assert.equal(await store.get('k4'), null)
      const reReserved = await store.reserve('k4', 'fp-4-retry')
      assert.equal(reReserved.claimed, true)
    })

    test('release never removes a completed key', async () => {
      await store.reserve('k5', 'fp-5')
      await store.complete('k5', { ok: true, value: 1 })
      await store.release('k5')

      const record = await store.get('k5')
      assert.equal(record!.status, 'completed')
    })

    test('two concurrent reserves on the same key: exactly one is claimed', async () => {
      const results = await Promise.all([store.reserve('k6', 'fp-6'), store.reserve('k6', 'fp-6')])
      const claimed = results.filter((r) => r.claimed)
      assert.equal(claimed.length, 1, 'exactly one concurrent reserve should win')
    })
  }
)
