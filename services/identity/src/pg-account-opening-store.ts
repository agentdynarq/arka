import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { AccountOpeningRecord, AccountOpeningStatus } from './types.ts'
import type { AccountOpeningStore } from './account-opening-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface OpeningRow {
  customer_id: string
  account_id: string
  full_name: string
  date_of_birth: string
  email: string
  phone: string
  kyc_document_id: string
  status: AccountOpeningStatus
  opened_at: string
}

function rowToRecord(row: OpeningRow): AccountOpeningRecord {
  return {
    customerId: row.customer_id,
    accountId: row.account_id,
    fullName: row.full_name,
    dateOfBirth: row.date_of_birth,
    email: row.email,
    phone: row.phone,
    kycDocumentId: row.kyc_document_id,
    status: row.status,
    openedAt: row.opened_at,
  }
}

/** `AccountOpeningStore` backed by one Cell's Postgres database, in its own `identity` schema. */
export class PgAccountOpeningStore implements AccountOpeningStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async save(record: AccountOpeningRecord): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO identity.account_openings
         (customer_id, account_id, full_name, date_of_birth, email, phone, kyc_document_id, status, opened_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.customerId,
        record.accountId,
        record.fullName,
        record.dateOfBirth,
        record.email,
        record.phone,
        record.kycDocumentId,
        record.status,
        record.openedAt,
      ]
    )
  }

  async get(customerId: string): Promise<AccountOpeningRecord | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<OpeningRow>(
      'SELECT * FROM identity.account_openings WHERE customer_id = $1',
      [customerId]
    )
    return rows[0] ? rowToRecord(rows[0]) : null
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
