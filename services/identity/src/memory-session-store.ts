import { randomUUID } from 'node:crypto'
import type { AccessTokenRow, ClaimRefreshTokenOutcome, RefreshTokenRow, SessionStore } from './session-store.ts'
import type { Role } from './types.ts'

interface FamilyRow {
  readonly familyId: string
  readonly userId: string
  readonly role: Role
  revoked: boolean
}

/** In-memory `SessionStore`, used by unit tests. */
export class InMemorySessionStore implements SessionStore {
  readonly #families = new Map<string, FamilyRow>()
  readonly #refreshTokens = new Map<string, RefreshTokenRow>()
  readonly #accessTokens = new Map<string, AccessTokenRow>()

  async createFamily(userId: string, role: Role): Promise<string> {
    const familyId = randomUUID()
    this.#families.set(familyId, { familyId, userId, role, revoked: false })
    return familyId
  }

  async getFamily(familyId: string): Promise<{ familyId: string; userId: string; role: Role; revoked: boolean } | null> {
    const family = this.#families.get(familyId)
    return family ? { ...family } : null
  }

  async insertRefreshToken(row: RefreshTokenRow): Promise<void> {
    this.#refreshTokens.set(row.tokenHash, row)
  }

  /**
   * No `await` runs between the read and the write below, so this method
   * body executes to completion in one microtask turn: two concurrent
   * callers cannot both observe `usedAt === null` for the same hash, the
   * same guarantee a single `UPDATE ... WHERE used_at IS NULL RETURNING *`
   * gives `PgSessionStore`.
   */
  async claimRefreshToken(tokenHash: string): Promise<ClaimRefreshTokenOutcome> {
    const row = this.#refreshTokens.get(tokenHash)
    if (!row) return { claimed: false, existing: null }
    if (row.usedAt !== null) return { claimed: false, existing: row }

    const claimed: RefreshTokenRow = { ...row, usedAt: new Date().toISOString() }
    this.#refreshTokens.set(tokenHash, claimed)
    return { claimed: true, row: claimed }
  }

  async insertAccessToken(row: AccessTokenRow): Promise<void> {
    this.#accessTokens.set(row.tokenHash, row)
  }

  async getAccessToken(tokenHash: string): Promise<AccessTokenRow | null> {
    return this.#accessTokens.get(tokenHash) ?? null
  }

  async revokeFamily(familyId: string): Promise<void> {
    const family = this.#families.get(familyId)
    if (family) family.revoked = true
  }
}
