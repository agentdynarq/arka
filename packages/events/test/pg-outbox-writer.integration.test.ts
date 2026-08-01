/**
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { randomUUID } from 'node:crypto'

import { PgOutboxWriter } from '../src/pg-outbox-writer.ts'
import type { DomainEvent } from '../src/types.ts'

const BASE_CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

async function isReachable(connectionString: string): Promise<boolean> {
  const probe = new Pool({ connectionString, connectionTimeoutMillis: 1000 })
  try {
    await probe.query('SELECT 1')
    return true
  } catch {
    return false
  } finally {
    await probe.end()
  }
}

/**
 * A local copy of `@arka/ledger`'s `ensureTestDatabase`: this package sits
 * below services in the dependency graph (services depend on packages, not
 * the reverse), so it cannot import from `@arka/ledger`. Creates
 * `databaseName` on the same server as `connectionString` if it does not
 * exist yet, so this suite gets a genuinely separate database from the one
 * `pnpm seed` populates instead of colliding with demo data.
 *
 * Kept in sync with `@arka/ledger`'s copy, including its advisory-lock fix:
 * this suite shares the `arka_cell1_test` name with accounts, identity,
 * ledger, notifications and payments, and `turbo run test` runs independent
 * packages concurrently on a cold cache, so all six used to race
 * `CREATE DATABASE` for that name at once. The loser failed with a raw
 * `duplicate key value violates unique constraint "pg_database_datname_index"`
 * (23505), not the friendlier `42P04` (database already exists) the old
 * guard only checked for -- reproduced directly against a dropped
 * `arka_cell1_test` with all six suites forced to run in parallel. A
 * Postgres session-level advisory lock keyed by hashtext of `databaseName`
 * serialises only the suites racing for the same name; a dedicated client
 * (not `adminPool` directly) runs both the lock and the `CREATE DATABASE`,
 * since a session-level advisory lock only blocks other sessions if held
 * by the specific session performing the guarded work -- splitting the
 * lock and the create across two different pooled connections would
 * silently defeat the whole point. `client.release()` is enough to drop
 * the lock: Postgres releases session-level advisory locks automatically
 * when the session ends, and nothing here needs it held any longer.
 */
async function ensureTestDatabase(connectionString: string, databaseName: string): Promise<string> {
  const target = new URL(connectionString)
  const admin = new URL(connectionString)
  admin.pathname = '/postgres'

  const adminPool = new Pool({ connectionString: admin.toString(), connectionTimeoutMillis: 2000 })
  const client = await adminPool.connect()
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1), 0)', [databaseName])
    try {
      await client.query(`CREATE DATABASE "${databaseName}"`)
    } catch (error) {
      const code = (error as { code?: string }).code
      // 42P04: database already exists, the ordinary path. 23505 on
      // pg_database_datname_index: kept as defence in depth, not expected
      // to trigger now that the lock serialises this.
      if (code !== '42P04' && code !== '23505') throw error
    }
  } finally {
    client.release()
    await adminPool.end()
  }

  target.pathname = `/${databaseName}`
  return target.toString()
}

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: randomUUID(),
    type: 'test.event',
    occurredAt: new Date().toISOString(),
    payload: { amount: '5000' },
    ...overrides,
  }
}

const reachable = await isReachable(BASE_CONNECTION_STRING)
const CONNECTION_STRING = reachable ? await ensureTestDatabase(BASE_CONNECTION_STRING, 'arka_cell1_test') : BASE_CONNECTION_STRING

describe(
  'PgOutboxWriter, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let writer: PgOutboxWriter

    before(async () => {
      writer = new PgOutboxWriter(CONNECTION_STRING, 'events_test_outbox')
      await writer.resetSchema()
    })

    after(async () => {
      await writer.close()
    })

    test('rejects a schema name that is not a plain identifier', () => {
      assert.throws(() => new PgOutboxWriter(CONNECTION_STRING, 'not a valid name; DROP TABLE x'))
    })

    test('a written event appears in pending, payload round-trips through jsonb', async () => {
      const e = event({ payload: { amount: '12500', note: 'test payload' } })
      await writer.write(e)

      const pending = await writer.pending()
      const found = pending.find((p) => p.eventId === e.eventId)
      assert.ok(found)
      assert.deepEqual(found!.payload, { amount: '12500', note: 'test payload' })
    })

    test('markPublished removes an event from pending, permanently', async () => {
      const e = event()
      await writer.write(e)
      await writer.markPublished([e.eventId])

      const pending = await writer.pending()
      assert.ok(!pending.some((p) => p.eventId === e.eventId))
    })

    test('writeWithClient commits atomically with the caller\'s own transaction: a rollback rolls back both', async () => {
      const pool = new Pool({ connectionString: CONNECTION_STRING })
      const client = await pool.connect()
      const e = event()

      try {
        await client.query('BEGIN')
        await client.query('CREATE TABLE IF NOT EXISTS events_test_outbox.probe (id text)')
        await client.query('INSERT INTO events_test_outbox.probe (id) VALUES ($1)', [e.eventId])
        await writer.writeWithClient(client, e)
        await client.query('ROLLBACK')
      } finally {
        client.release()
        await pool.end()
      }

      const pending = await writer.pending()
      assert.ok(
        !pending.some((p) => p.eventId === e.eventId),
        'the outbox write must have rolled back along with the rest of the transaction'
      )
    })

    test('writeWithClient commits atomically: a successful commit keeps both writes', async () => {
      const pool = new Pool({ connectionString: CONNECTION_STRING })
      const client = await pool.connect()
      const e = event()

      try {
        await client.query('BEGIN')
        await client.query('CREATE TABLE IF NOT EXISTS events_test_outbox.probe (id text)')
        await client.query('INSERT INTO events_test_outbox.probe (id) VALUES ($1)', [e.eventId])
        await writer.writeWithClient(client, e)
        await client.query('COMMIT')
      } finally {
        client.release()
        await pool.end()
      }

      const pending = await writer.pending()
      assert.ok(pending.some((p) => p.eventId === e.eventId))
    })
  }
)
