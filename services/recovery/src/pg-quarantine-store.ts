import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { QuarantineDirection, QuarantineRow, QuarantineState } from './types.ts'
import type { QuarantineStore } from './quarantine-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface Row {
  cell_id: string
  state: QuarantineState
  direction: QuarantineDirection | null
  approved_by: string[]
  reason: string | null
}

function rowToQuarantineRow(row: Row): QuarantineRow {
  return { cellId: row.cell_id, state: row.state, direction: row.direction, approvedBy: row.approved_by, reason: row.reason }
}

function emptyRow(cellId: string): QuarantineRow {
  return { cellId, state: 'none', direction: null, approvedBy: [], reason: null }
}

/**
 * `QuarantineStore` backed by one control-plane Postgres, in its own
 * `recovery` schema. Every state transition is a single atomic `UPDATE`
 * with a `WHERE` clause encoding its precondition, the same
 * one-statement-decides-everything style as `PgSessionStore.claimRefreshToken`
 * in `@arka/identity` and `PgLedgerStore.append` in `@arka/ledger`.
 */
export class PgQuarantineStore implements QuarantineStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async ensureRow(cellId: string): Promise<QuarantineRow> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>(
      `INSERT INTO recovery.quarantine_cells (cell_id, state, approved_by)
       VALUES ($1, 'none', '[]'::jsonb)
       ON CONFLICT (cell_id) DO UPDATE SET cell_id = EXCLUDED.cell_id
       RETURNING *`,
      [cellId]
    )
    return rowToQuarantineRow(rows[0]!)
  }

  async get(cellId: string): Promise<QuarantineRow> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>('SELECT * FROM recovery.quarantine_cells WHERE cell_id = $1', [cellId])
    return rows[0] ? rowToQuarantineRow(rows[0]) : emptyRow(cellId)
  }

  async startPending(
    cellId: string,
    direction: QuarantineDirection,
    requestedBy: string,
    reason: string | null,
    expectedState: QuarantineState
  ): Promise<{ started: boolean; row: QuarantineRow }> {
    await this.#ensureSchema()
    await this.ensureRow(cellId)

    const updated = await this.#pool.query<Row>(
      `UPDATE recovery.quarantine_cells
       SET state = 'pending_second_approval', direction = $2, approved_by = $3::jsonb, reason = $4
       WHERE cell_id = $1 AND state = $5
       RETURNING *`,
      [cellId, direction, JSON.stringify([requestedBy]), reason, expectedState]
    )
    if (updated.rows.length > 0) {
      return { started: true, row: rowToQuarantineRow(updated.rows[0]!) }
    }

    return { started: false, row: await this.get(cellId) }
  }

  async addApprover(
    cellId: string,
    approvedBy: string,
    direction: QuarantineDirection
  ): Promise<{ added: boolean; row: QuarantineRow }> {
    await this.#ensureSchema()

    // `approved_by` is assigned exactly once: a second assignment to the same
    // column in one UPDATE is invalid SQL, not just redundant. The finalising
    // branches are folded into this single CASE instead. Quarantined keeps
    // its two approvers on display; a completed lift resets to a clean slate,
    // per QuarantineStore's contract.
    const updated = await this.#pool.query<Row>(
      `UPDATE recovery.quarantine_cells
       SET
         state = CASE WHEN jsonb_array_length(approved_by) + 1 >= 2
                    THEN (CASE WHEN direction = 'quarantine' THEN 'quarantined' ELSE 'none' END)
                    ELSE 'pending_second_approval' END,
         direction = CASE WHEN jsonb_array_length(approved_by) + 1 >= 2 THEN NULL ELSE direction END,
         reason = CASE WHEN jsonb_array_length(approved_by) + 1 >= 2 THEN NULL ELSE reason END,
         approved_by = CASE
           WHEN jsonb_array_length(approved_by) + 1 >= 2 AND direction = 'lift' THEN '[]'::jsonb
           ELSE approved_by || to_jsonb($2::text)
         END
       WHERE cell_id = $1 AND state = 'pending_second_approval' AND direction = $3 AND NOT (approved_by ? $2)
       RETURNING *`,
      [cellId, approvedBy, direction]
    )
    if (updated.rows.length > 0) {
      return { added: true, row: rowToQuarantineRow(updated.rows[0]!) }
    }

    return { added: false, row: await this.get(cellId) }
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
