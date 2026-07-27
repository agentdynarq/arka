import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { PoolClient } from 'pg'
import { AuditTrailConflictError } from './audit-trail-store.ts'
import type { AuditTrailStore } from './audit-trail-store.ts'
import type { AuditRecord } from './audit-hash.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

const UNIQUE_VIOLATION = '23505'

interface Row {
  seq: number
  prev_hash: string
  actor: string
  action: string
  cell_id: string | null
  occurred_at: string
  hash: string
}

function rowToRecord(row: Row): AuditRecord {
  return {
    seq: row.seq,
    prevHash: row.prev_hash,
    actor: row.actor,
    action: row.action,
    cellId: row.cell_id,
    occurredAt: row.occurred_at,
    hash: row.hash,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION
}

/**
 * `AuditTrailStore` backed by one control-plane Postgres. Concurrency
 * control is the primary key on `seq`, exactly `PgLedgerStore`'s reasoning:
 * two operator actions racing to append the next record both compute the
 * same next `seq` from the head they read, and whichever `INSERT` loses hits
 * a unique violation, translated here into {@link AuditTrailConflictError}.
 */
export class PgAuditTrailStore implements AuditTrailStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async head(): Promise<AuditRecord | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>('SELECT * FROM recovery.audit_trail ORDER BY seq DESC LIMIT 1')
    return rows[0] ? rowToRecord(rows[0]) : null
  }

  async append(record: AuditRecord, expectedHeadSeq: number | null): Promise<void> {
    await this.#ensureSchema()

    let client: PoolClient | undefined
    try {
      client = await this.#pool.connect()
      await client.query(
        `INSERT INTO recovery.audit_trail (seq, prev_hash, actor, action, cell_id, occurred_at, hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [record.seq, record.prevHash, record.actor, record.action, record.cellId, record.occurredAt, record.hash]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        const actual = await this.head()
        throw new AuditTrailConflictError(expectedHeadSeq, actual?.seq ?? null)
      }
      throw error
    } finally {
      client?.release()
    }
  }

  async read(): Promise<AuditRecord[]> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>('SELECT * FROM recovery.audit_trail ORDER BY seq ASC')
    return rows.map(rowToRecord)
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS recovery CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
