import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { RateLimitOutcome, RateLimiter } from './rate-limiter.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

/**
 * `RateLimiter` backed by one Cell's Postgres database. One row per (key,
 * window), `INSERT ... ON CONFLICT DO UPDATE count = count + 1 RETURNING
 * count`, the same single-statement concurrency-safe shape as
 * `payments.idempotency_keys`: two concurrent hits in the same window both
 * land, and whichever one reads back a count over the limit is refused.
 */
export class PgRateLimiter implements RateLimiter {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitOutcome> {
    await this.#ensureSchema()
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs

    const { rows } = await this.#pool.query<{ count: number }>(
      `INSERT INTO identity.rate_limit_hits (key, window_start, count)
       VALUES ($1, $2, 1)
       ON CONFLICT (key, window_start) DO UPDATE SET count = identity.rate_limit_hits.count + 1
       RETURNING count`,
      [key, windowStart]
    )

    const count = rows[0]!.count
    if (count > limit) {
      return { allowed: false, retryAfterMs: windowStart + windowMs - now }
    }
    return { allowed: true }
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS identity CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
