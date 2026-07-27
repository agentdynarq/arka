import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import { AccountsError } from './types.ts'
import type { Account } from './types.ts'
import type { AccountRegistry } from './registry.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

/** Postgres error code for a unique or primary key violation. */
const UNIQUE_VIOLATION = '23505'

interface AccountRow {
  account_id: string
  customer_id: string
  display_name: string
  opened_at: string
}

function rowToAccount(row: AccountRow): Account {
  return {
    accountId: row.account_id,
    customerId: row.customer_id,
    displayName: row.display_name,
    openedAt: row.opened_at,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION
}

/** `AccountRegistry` backed by one Cell's Postgres database, in its own `accounts` schema. */
export class PgAccountRegistry implements AccountRegistry {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async open(account: Account): Promise<void> {
    await this.#ensureSchema()
    try {
      await this.#pool.query(
        `INSERT INTO accounts.accounts (account_id, customer_id, display_name, opened_at)
         VALUES ($1, $2, $3, $4)`,
        [account.accountId, account.customerId, account.displayName, account.openedAt]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AccountsError('ACCOUNT_ALREADY_EXISTS', `Account "${account.accountId}" already exists`)
      }
      throw error
    }
  }

  async get(accountId: string): Promise<Account | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<AccountRow>(
      'SELECT * FROM accounts.accounts WHERE account_id = $1',
      [accountId]
    )
    return rows[0] ? rowToAccount(rows[0]) : null
  }

  async listByCustomer(customerId: string): Promise<Account[]> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<AccountRow>(
      'SELECT * FROM accounts.accounts WHERE customer_id = $1 ORDER BY opened_at ASC',
      [customerId]
    )
    return rows.map(rowToAccount)
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS accounts CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this registry's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
