import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import { LedgerConflictError } from './store.ts'
import type { LedgerStore } from './store.ts'
import type { Block, Direction, Entry } from './ledger-core.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

/** Postgres error code for a unique or primary key violation. */
const UNIQUE_VIOLATION = '23505'

interface StoredEntry {
  account: string
  direction: Direction
  amount: string
}

interface BlockRow {
  seq: string
  prev_hash: string
  at: string
  hash: string
  entries: StoredEntry[]
}

function serializeEntries(entries: readonly Entry[]): StoredEntry[] {
  return entries.map((e) => ({ account: e.account, direction: e.direction, amount: e.amount.toString() }))
}

function deserializeEntries(stored: readonly StoredEntry[]): Entry[] {
  return stored.map((e) => ({ account: e.account, direction: e.direction, amount: BigInt(e.amount) }))
}

function rowToBlock(row: BlockRow): Block {
  return {
    seq: Number(row.seq),
    prevHash: row.prev_hash,
    at: row.at,
    hash: row.hash,
    entries: deserializeEntries(row.entries),
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION
}

/**
 * A `LedgerStore` backed by one Cell's Postgres database.
 *
 * Concurrency control is the primary key on `seq`, not an application-level
 * lock. Two writers racing to append the next block both compute the same
 * next sequence number from the head they read; whichever `INSERT` loses the
 * race hits a unique violation, which is translated here into
 * {@link LedgerConflictError}. `LedgerService.record` catches that and
 * retries against the new head. See `docs/adr/0002` and `schema.sql`.
 */
export class PgLedgerStore implements LedgerStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  /**
   * Takes a connection string, not a `Pool`, so that `pg` stays an
   * implementation detail entirely inside this package. A caller in
   * `scripts/`, which is not itself a workspace package, never needs `pg` as
   * a dependency of its own.
   */
  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async head(): Promise<Block | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<BlockRow>(
      'SELECT * FROM ledger.blocks ORDER BY seq DESC LIMIT 1'
    )
    return rows[0] ? rowToBlock(rows[0]) : null
  }

  async append(block: Block, expectedHeadSeq: number | null): Promise<void> {
    await this.#ensureSchema()

    let client: PoolClient | undefined
    try {
      client = await this.#pool.connect()
      await client.query(
        `INSERT INTO ledger.blocks (seq, prev_hash, at, hash, entries)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [block.seq, block.prevHash, block.at, block.hash, JSON.stringify(serializeEntries(block.entries))]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        const actual = await this.head()
        throw new LedgerConflictError(expectedHeadSeq, actual?.seq ?? null)
      }
      throw error
    } finally {
      client?.release()
    }
  }

  async read(range?: { from?: number; to?: number }): Promise<Block[]> {
    await this.#ensureSchema()
    const from = range?.from ?? 0
    const to = range?.to ?? Number.MAX_SAFE_INTEGER
    const { rows } = await this.#pool.query<BlockRow>(
      'SELECT * FROM ledger.blocks WHERE seq >= $1 AND seq <= $2 ORDER BY seq ASC',
      [from, to]
    )
    return rows.map(rowToBlock)
  }

  async count(): Promise<number> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<{ count: string }>(
      'SELECT COUNT(*) AS count FROM ledger.blocks'
    )
    return Number(rows[0]!.count)
  }

  /**
   * Drop and recreate the schema. Test and seed-reset use only. Never called
   * from application code, and there is no path to it from any service
   * endpoint.
   */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS ledger CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}

/** True if a Postgres server is reachable at `connectionString` within one second. */
export async function isPostgresReachable(connectionString: string): Promise<boolean> {
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
 * Creates `databaseName` on the same Postgres server as `connectionString` if
 * it does not already exist yet, then returns a connection string pointing
 * at it. Test suites call this to get a genuinely separate database from the
 * one `pnpm seed` populates, instead of colliding with demo data on every
 * `resetSchema()` (arka-ops/LOG.md, 28 July: `pnpm test` was wiping the
 * seeded demo because every integration test's default connection string
 * fell back to the same database the demo uses).
 *
 * Several suites share one database name (`arka_cell1_test`: accounts,
 * identity, ledger, notifications, payments), and `turbo run test` runs
 * independent packages concurrently by default, so on a cold cache all of
 * them call this function for the same name at once. `CREATE DATABASE`
 * is not one atomic check-then-insert from the caller's side: two
 * concurrent sessions can both pass Postgres's own existence check and
 * race the catalog insert, and the loser fails not with the expected
 * `42P04` (database already exists) but with a raw
 * `duplicate key value violates unique constraint "pg_database_datname_index"`
 * (23505) -- reproduced directly against a dropped `arka_cell1_test` with
 * all six suites forced to run in parallel, which is exactly the failure
 * this function now prevents rather than merely tolerating a different
 * error code for.
 *
 * Fixed with a Postgres session-level advisory lock keyed by hashtext of
 * `databaseName`, so only suites racing for the SAME name ever serialise
 * against each other; a suite targeting a different database (e.g.
 * recovery's `arka_control_test`, on an entirely separate Postgres server)
 * never waits on this one. The lock and the `CREATE DATABASE` both run on
 * one dedicated client checked out of the pool, not on `adminPool`
 * directly: a session-level advisory lock only blocks other sessions if
 * held by a real, specific session, so acquiring it via one pool query and
 * creating the database via another risks the two statements landing on
 * different pooled connections, which would silently defeat the whole
 * point. `client.release()` after use, rather than an explicit
 * `pg_advisory_unlock`, is enough: Postgres releases session-level
 * advisory locks automatically when the session ends, and this function
 * never needs the lock held past its own return.
 */
export async function ensureTestDatabase(connectionString: string, databaseName: string): Promise<string> {
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
      // 42P04: database already exists, the ordinary path once a previous
      // run (or, before this fix, a race's winner) has created it.
      // UNIQUE_VIOLATION on pg_database_datname_index: kept as defence in
      // depth for any caller that reaches Postgres without going through
      // this lock, not expected to trigger now that the lock serialises
      // every known caller.
      if (code !== '42P04' && code !== UNIQUE_VIOLATION) throw error
    }
  } finally {
    client.release()
    await adminPool.end()
  }

  target.pathname = `/${databaseName}`
  return target.toString()
}
