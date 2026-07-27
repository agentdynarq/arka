/**
 * Every store in this service shares the single `payments` Postgres schema,
 * so this is one file, not one per store. Resetting that schema concurrently
 * from more than one test file racing on the same schema name is a real
 * collision, not a hypothetical one: it produced exactly this failure the
 * first time `PgIdempotencyStore` and `PgLimitsStore` had their own separate
 * integration files, each resetting the same schema in its own `before()`
 * hook, run concurrently by Node's test runner (files run in parallel by
 * default). Keshan hit and documented the identical class of bug in
 * `services/identity/test/pg-stores.integration.test.ts`; same fix here.
 *
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { isPostgresReachable } from '@arka/ledger'

import { PgIdempotencyStore } from '../src/pg-idempotency-store.ts'
import { PgLimitsStore } from '../src/pg-limits-store.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

const reachable = await isPostgresReachable(CONNECTION_STRING)

describe(
  'Payments Postgres stores, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let idempotency: PgIdempotencyStore<{ ok: true; value: number }>
    let limits: PgLimitsStore

    before(async () => {
      idempotency = new PgIdempotencyStore(CONNECTION_STRING)
      await idempotency.resetSchema() // owns the schema; limits reuses what this creates
      limits = new PgLimitsStore(CONNECTION_STRING)
    })

    after(async () => {
      await idempotency.close()
      await limits.close()
    })

    describe('PgIdempotencyStore', () => {
      test('an unknown key is null', async () => {
        assert.equal(await idempotency.get('nope'), null)
      })

      test('reserve claims an unclaimed key', async () => {
        const outcome = await idempotency.reserve('k1', 'fp-1')
        assert.equal(outcome.claimed, true)

        const record = await idempotency.get('k1')
        assert.equal(record!.status, 'pending')
        assert.equal(record!.requestFingerprint, 'fp-1')
        assert.equal(record!.result, null)
      })

      test('a second reserve on the same key is told it lost, and sees the same fingerprint', async () => {
        await idempotency.reserve('k2', 'fp-2')
        const second = await idempotency.reserve('k2', 'fp-2')

        assert.equal(second.claimed, false)
        if (!second.claimed) {
          assert.equal(second.existing.requestFingerprint, 'fp-2')
        }
      })

      test('complete stores the result, visible to get', async () => {
        await idempotency.reserve('k3', 'fp-3')
        await idempotency.complete('k3', { ok: true, value: 42 })

        const record = await idempotency.get('k3')
        assert.equal(record!.status, 'completed')
        assert.deepEqual(record!.result, { ok: true, value: 42 })
      })

      test('release removes a pending key so it can be reserved again', async () => {
        await idempotency.reserve('k4', 'fp-4')
        await idempotency.release('k4')

        assert.equal(await idempotency.get('k4'), null)
        const reReserved = await idempotency.reserve('k4', 'fp-4-retry')
        assert.equal(reReserved.claimed, true)
      })

      test('release never removes a completed key', async () => {
        await idempotency.reserve('k5', 'fp-5')
        await idempotency.complete('k5', { ok: true, value: 1 })
        await idempotency.release('k5')

        const record = await idempotency.get('k5')
        assert.equal(record!.status, 'completed')
      })

      test('two concurrent reserves on the same key: exactly one is claimed', async () => {
        const results = await Promise.all([idempotency.reserve('k6', 'fp-6'), idempotency.reserve('k6', 'fp-6')])
        const claimed = results.filter((r) => r.claimed)
        assert.equal(claimed.length, 1, 'exactly one concurrent reserve should win')
      })
    })

    describe('PgLimitsStore', () => {
      test('an account with no override is null', async () => {
        assert.equal(await limits.get('customer:nobody'), null)
      })

      test('set then get round-trips the exact bigint value', async () => {
        const huge = 9_007_199_254_740_993n // Number.MAX_SAFE_INTEGER + 2
        await limits.set('customer:alice', huge)
        assert.equal(await limits.get('customer:alice'), huge)
      })

      test('set again on the same account overwrites rather than erroring', async () => {
        await limits.set('customer:bob', 100_00n)
        await limits.set('customer:bob', 300_00n)
        assert.equal(await limits.get('customer:bob'), 300_00n)
      })
    })
  }
)
