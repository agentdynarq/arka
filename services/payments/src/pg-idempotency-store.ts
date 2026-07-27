import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { IdempotencyStore, IdempotencyRecord, ReserveOutcome } from './idempotency-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface KeyRow {
  key: string
  status: 'pending' | 'completed'
  request_fingerprint: string
  result: unknown
}

function rowToRecord<T>(row: KeyRow): IdempotencyRecord<T> {
  return {
    status: row.status,
    requestFingerprint: row.request_fingerprint,
    result: (row.result as T | null) ?? null,
  }
}

/**
 * `IdempotencyStore` backed by one Cell's Postgres database, in its own
 * `payments` schema.
 *
 * `reserve` is a single `INSERT ... ON CONFLICT DO NOTHING RETURNING *`.
 * Under read-committed isolation, a losing insert only returns zero rows once
 * the winning row is durably committed and visible, so the follow-up `get`
 * always finds it: there is no window where `reserve` reports a loss but a
 * subsequent read finds nothing.
 */
export class PgIdempotencyStore<T> implements IdempotencyStore<T> {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async reserve(key: string, requestFingerprint: string): Promise<ReserveOutcome<T>> {
    await this.#ensureSchema()

    const inserted = await this.#pool.query<KeyRow>(
      `INSERT INTO payments.idempotency_keys (key, status, request_fingerprint)
       VALUES ($1, 'pending', $2)
       ON CONFLICT (key) DO NOTHING
       RETURNING *`,
      [key, requestFingerprint]
    )
    if (inserted.rows.length > 0) {
      return { claimed: true }
    }

    const existing = await this.get(key)
    if (!existing) {
      throw new Error(`idempotency key "${key}" reported a conflict but no row was found on read-back`)
    }
    return { claimed: false, existing }
  }

  async complete(key: string, result: T): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `UPDATE payments.idempotency_keys SET status = 'completed', result = $2::jsonb WHERE key = $1`,
      [key, JSON.stringify(result)]
    )
  }

  async release(key: string): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(`DELETE FROM payments.idempotency_keys WHERE key = $1 AND status = 'pending'`, [key])
  }

  async get(key: string): Promise<IdempotencyRecord<T> | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<KeyRow>(
      'SELECT * FROM payments.idempotency_keys WHERE key = $1',
      [key]
    )
    return rows[0] ? rowToRecord<T>(rows[0]) : null
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS payments CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
