import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { QrRedemptionStore } from './qr-redemption-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

/** `QrRedemptionStore` backed by one Cell's Postgres database, in its own `payments` schema. */
export class PgQrRedemptionStore implements QrRedemptionStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async claimOrGetOwner(tokenHash: string, idempotencyKey: string): Promise<string> {
    await this.#ensureSchema()
    // `token_hash = EXCLUDED.token_hash` is a no-op self-update, present
    // only so `ON CONFLICT` can `DO UPDATE ... RETURNING` instead of
    // silently returning no rows: it leaves `idempotency_key` untouched on
    // a conflict, so this always returns exactly one row, the owner's key,
    // whether that owner is this call (a fresh insert) or an earlier one.
    const { rows } = await this.#pool.query<{ idempotency_key: string }>(
      `INSERT INTO payments.qr_redemptions (token_hash, idempotency_key, redeemed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (token_hash) DO UPDATE SET token_hash = EXCLUDED.token_hash
       RETURNING idempotency_key`,
      [tokenHash, idempotencyKey, new Date().toISOString()]
    )
    return rows[0]!.idempotency_key
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
