import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import { IdentityError } from './types.ts'
import type { CustomerRecord, Role } from './types.ts'
import type { UserStore } from './user-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

const UNIQUE_VIOLATION = '23505'

interface UserRow {
  user_id: string
  username: string
  password_hash: string
  role: Role
  customer_id: string | null
  mfa_secret: string
  failed_login_count: number
  locked_until: string | null
  created_at: string
}

function rowToUser(row: UserRow): CustomerRecord {
  return {
    userId: row.user_id,
    username: row.username,
    passwordHash: row.password_hash,
    role: row.role,
    customerId: row.customer_id,
    mfaSecret: row.mfa_secret,
    failedLoginCount: row.failed_login_count,
    lockedUntil: row.locked_until,
    createdAt: row.created_at,
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION
}

/** `UserStore` backed by one Cell's Postgres database, in its own `identity` schema. */
export class PgUserStore implements UserStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async create(user: CustomerRecord): Promise<void> {
    await this.#ensureSchema()
    try {
      await this.#pool.query(
        `INSERT INTO identity.users
           (user_id, username, password_hash, role, customer_id, mfa_secret, failed_login_count, locked_until, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          user.userId,
          user.username,
          user.passwordHash,
          user.role,
          user.customerId,
          user.mfaSecret,
          user.failedLoginCount,
          user.lockedUntil,
          user.createdAt,
        ]
      )
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new IdentityError('USERNAME_ALREADY_EXISTS', `Username "${user.username}" already exists`)
      }
      throw error
    }
  }

  async getByUsername(username: string): Promise<CustomerRecord | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<UserRow>('SELECT * FROM identity.users WHERE username = $1', [username])
    return rows[0] ? rowToUser(rows[0]) : null
  }

  async getById(userId: string): Promise<CustomerRecord | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<UserRow>('SELECT * FROM identity.users WHERE user_id = $1', [userId])
    return rows[0] ? rowToUser(rows[0]) : null
  }

  async incrementFailedLogins(userId: string): Promise<number> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<{ failed_login_count: number }>(
      `UPDATE identity.users SET failed_login_count = failed_login_count + 1
       WHERE user_id = $1
       RETURNING failed_login_count`,
      [userId]
    )
    if (!rows[0]) throw new Error(`no such user "${userId}"`)
    return rows[0].failed_login_count
  }

  async resetFailedLogins(userId: string): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query('UPDATE identity.users SET failed_login_count = 0 WHERE user_id = $1', [userId])
  }

  async setLockedUntil(userId: string, lockedUntil: string | null): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query('UPDATE identity.users SET locked_until = $2 WHERE user_id = $1', [userId, lockedUntil])
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
