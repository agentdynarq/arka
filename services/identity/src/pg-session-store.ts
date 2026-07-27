import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import type { AccessTokenRow, ClaimRefreshTokenOutcome, RefreshTokenRow, SessionStore } from './session-store.ts'
import type { Role } from './types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface RefreshRow {
  token_hash: string
  family_id: string
  used_at: string | null
  expires_at: string
}

interface AccessRow {
  token_hash: string
  family_id: string
  user_id: string
  role: Role
  expires_at: string
}

function rowToRefresh(row: RefreshRow): RefreshTokenRow {
  return { tokenHash: row.token_hash, familyId: row.family_id, usedAt: row.used_at, expiresAt: row.expires_at }
}

function rowToAccess(row: AccessRow): AccessTokenRow {
  return { tokenHash: row.token_hash, familyId: row.family_id, userId: row.user_id, role: row.role, expiresAt: row.expires_at }
}

/**
 * `SessionStore` backed by one Cell's Postgres database, in its own
 * `identity` schema. Purely storage: see `session-store.ts` for why the
 * rotation and reuse-detection algorithm is not here.
 */
export class PgSessionStore implements SessionStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async createFamily(userId: string, role: Role): Promise<string> {
    await this.#ensureSchema()
    const familyId = randomUUID()
    await this.#pool.query(
      'INSERT INTO identity.session_families (family_id, user_id, role) VALUES ($1, $2, $3)',
      [familyId, userId, role]
    )
    return familyId
  }

  async getFamily(familyId: string): Promise<{ familyId: string; userId: string; role: Role; revoked: boolean } | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<{ family_id: string; user_id: string; role: Role; revoked: boolean }>(
      'SELECT * FROM identity.session_families WHERE family_id = $1',
      [familyId]
    )
    const row = rows[0]
    return row ? { familyId: row.family_id, userId: row.user_id, role: row.role, revoked: row.revoked } : null
  }

  async insertRefreshToken(row: RefreshTokenRow): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO identity.refresh_tokens (token_hash, family_id, used_at, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [row.tokenHash, row.familyId, row.usedAt, row.expiresAt]
    )
  }

  /**
   * A single `UPDATE ... WHERE used_at IS NULL RETURNING *`. Under
   * read-committed isolation, a losing concurrent update sees zero rows
   * back only once the winning update is durably committed, so the
   * follow-up `SELECT` below always finds the now-used row: there is no
   * window where this reports "not claimed" but a read finds nothing. Same
   * reasoning as `PgIdempotencyStore.reserve` in `@arka/payments`.
   */
  async claimRefreshToken(tokenHash: string): Promise<ClaimRefreshTokenOutcome> {
    await this.#ensureSchema()

    const claimed = await this.#pool.query<RefreshRow>(
      `UPDATE identity.refresh_tokens SET used_at = $2
       WHERE token_hash = $1 AND used_at IS NULL
       RETURNING *`,
      [tokenHash, new Date().toISOString()]
    )
    if (claimed.rows.length > 0) {
      return { claimed: true, row: rowToRefresh(claimed.rows[0]!) }
    }

    const { rows } = await this.#pool.query<RefreshRow>(
      'SELECT * FROM identity.refresh_tokens WHERE token_hash = $1',
      [tokenHash]
    )
    return { claimed: false, existing: rows[0] ? rowToRefresh(rows[0]) : null }
  }

  async insertAccessToken(row: AccessTokenRow): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO identity.access_tokens (token_hash, family_id, user_id, role, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [row.tokenHash, row.familyId, row.userId, row.role, row.expiresAt]
    )
  }

  async getAccessToken(tokenHash: string): Promise<AccessTokenRow | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<AccessRow>(
      'SELECT * FROM identity.access_tokens WHERE token_hash = $1',
      [tokenHash]
    )
    return rows[0] ? rowToAccess(rows[0]) : null
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query('UPDATE identity.session_families SET revoked = true WHERE family_id = $1', [familyId])
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
