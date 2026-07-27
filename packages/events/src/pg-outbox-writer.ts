import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import type { OutboxWriter } from './outbox-writer.ts'
import type { DomainEvent } from './types.ts'

/**
 * A schema name safe to interpolate into DDL and table references.
 *
 * Postgres has no way to parameterise an identifier the way `$1` parameterises
 * a value, so the schema name is validated against this pattern instead of
 * being escaped: reject anything that is not a plain lowercase identifier
 * rather than trying to make an arbitrary string safe to interpolate.
 */
const VALID_SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/

/**
 * `OutboxWriter` backed by Postgres, in a schema the caller names.
 *
 * Reusable across services on purpose: this package owns no schema of its
 * own, since the whole point of the outbox pattern is that each event is
 * written in the same transaction as the state change that produced it,
 * which only the producing service's own connection can do.
 */
export class PgOutboxWriter implements OutboxWriter {
  readonly #pool: Pool
  readonly #schema: string
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string, schema: string) {
    if (!VALID_SCHEMA_NAME.test(schema)) {
      throw new Error(`"${schema}" is not a valid schema name for an outbox table`)
    }
    this.#pool = new Pool({ connectionString })
    this.#schema = schema
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool
      .query(
        `CREATE SCHEMA IF NOT EXISTS ${this.#schema};
         CREATE TABLE IF NOT EXISTS ${this.#schema}.outbox (
           event_id      text PRIMARY KEY,
           type          text NOT NULL,
           occurred_at   text NOT NULL,
           payload       jsonb NOT NULL,
           published_at  timestamptz
         );
         CREATE INDEX IF NOT EXISTS outbox_unpublished ON ${this.#schema}.outbox (event_id) WHERE published_at IS NULL;`
      )
      .then(() => undefined)
    return this.#schemaReady
  }

  /**
   * Write an event using an existing client, so it commits or rolls back in
   * the same transaction as whatever the caller is already doing on that
   * client. This is the method that actually delivers the "same transaction"
   * half of the outbox pattern; `write` below is a convenience wrapper for a
   * caller with nothing else to share a transaction with.
   */
  async writeWithClient(client: PoolClient, event: DomainEvent): Promise<void> {
    await this.#ensureSchema()
    await client.query(
      `INSERT INTO ${this.#schema}.outbox (event_id, type, occurred_at, payload) VALUES ($1, $2, $3, $4::jsonb)`,
      [event.eventId, event.type, event.occurredAt, JSON.stringify(event.payload)]
    )
  }

  async write(event: DomainEvent): Promise<void> {
    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await this.writeWithClient(client, event)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async pending(limit = 100): Promise<DomainEvent[]> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<{
      event_id: string
      type: string
      occurred_at: string
      payload: unknown
    }>(
      `SELECT event_id, type, occurred_at, payload FROM ${this.#schema}.outbox
       WHERE published_at IS NULL ORDER BY event_id ASC LIMIT $1`,
      [limit]
    )
    return rows.map((row) => ({
      eventId: row.event_id,
      type: row.type,
      occurredAt: row.occurred_at,
      payload: row.payload,
    }))
  }

  async markPublished(eventIds: readonly string[]): Promise<void> {
    if (eventIds.length === 0) return
    await this.#ensureSchema()
    await this.#pool.query(`UPDATE ${this.#schema}.outbox SET published_at = now() WHERE event_id = ANY($1::text[])`, [
      eventIds,
    ])
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query(`DROP SCHEMA IF EXISTS ${this.#schema} CASCADE`)
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this writer's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
