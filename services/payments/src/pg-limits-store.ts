import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { LimitsStore } from './limits-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

/** `LimitsStore` backed by one Cell's Postgres database, in its own `payments` schema. */
export class PgLimitsStore implements LimitsStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async get(accountId: string): Promise<bigint | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<{ limit_value: string }>(
      'SELECT limit_value FROM payments.daily_limits WHERE account_id = $1',
      [accountId]
    )
    return rows[0] ? BigInt(rows[0].limit_value) : null
  }

  async set(accountId: string, limit: bigint): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO payments.daily_limits (account_id, limit_value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO UPDATE SET limit_value = $2, updated_at = $3`,
      [accountId, limit.toString(), new Date().toISOString()]
    )
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
