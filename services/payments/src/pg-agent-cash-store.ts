import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { AgentCashStore, AgentCashRow } from './agent-cash-store.ts'
import type { AgentCashDirection } from './types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface Row {
  request_id: string
  agent_id: string
  agent_account_id: string
  customer_account_id: string
  direction: string
  amount: string
  otp_code: string
  expires_at: string
  consumed_at: string | null
}

function rowToAgentCashRow(row: Row): AgentCashRow {
  return {
    requestId: row.request_id,
    agentId: row.agent_id,
    agentAccountId: row.agent_account_id,
    customerAccountId: row.customer_account_id,
    direction: row.direction as AgentCashDirection,
    amount: BigInt(row.amount),
    otpCode: row.otp_code,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
  }
}

/** `AgentCashStore` backed by one Cell's Postgres database, in its own `payments` schema. */
export class PgAgentCashStore implements AgentCashStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async create(row: Omit<AgentCashRow, 'consumedAt'>): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO payments.agent_cash_requests
         (request_id, agent_id, agent_account_id, customer_account_id, direction, amount, otp_code, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        row.requestId,
        row.agentId,
        row.agentAccountId,
        row.customerAccountId,
        row.direction,
        row.amount.toString(),
        row.otpCode,
        row.expiresAt,
      ]
    )
  }

  async get(requestId: string): Promise<AgentCashRow | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>(
      `SELECT * FROM payments.agent_cash_requests WHERE request_id = $1`,
      [requestId]
    )
    return rows[0] ? rowToAgentCashRow(rows[0]) : null
  }

  async consume(requestId: string): Promise<boolean> {
    await this.#ensureSchema()
    // WHERE consumed_at IS NULL makes this the concurrency control, the same
    // atomic-UPDATE-with-its-own-precondition shape as every other race in
    // this codebase (PgIdempotencyStore.reserve, PgSessionStore
    // .claimRefreshToken, the quarantine dual-approval UPDATE). Whichever
    // concurrent call's WHERE clause is no longer satisfied by the time it
    // runs updates zero rows and gets false back, not an error.
    const { rowCount } = await this.#pool.query(
      `UPDATE payments.agent_cash_requests SET consumed_at = $2 WHERE request_id = $1 AND consumed_at IS NULL`,
      [requestId, new Date().toISOString()]
    )
    return (rowCount ?? 0) > 0
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
