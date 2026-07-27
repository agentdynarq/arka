import type { Role } from './types.ts'

/**
 * Low-level session storage. Deliberately dumb: this port has no notion of
 * "rotate" or "reuse detected", only the primitives those concepts are built
 * from. The rotation algorithm and reuse-detection logic live once, in
 * `IdentityService`, and run identically over `InMemorySessionStore` and
 * `PgSessionStore`, the same separation `LedgerService.record` keeps from
 * `LedgerStore.append`.
 *
 * Tokens are addressed by hash everywhere in this interface. Nothing here
 * ever sees or stores a raw token: hashing happens in the service, before a
 * token reaches a store, so a database read alone is never enough to
 * impersonate a session, the same reasoning that keeps a password hash
 * one-way.
 */
export interface RefreshTokenRow {
  readonly tokenHash: string
  readonly familyId: string
  readonly usedAt: string | null
  readonly expiresAt: string
}

export interface AccessTokenRow {
  readonly tokenHash: string
  readonly familyId: string
  readonly userId: string
  readonly role: Role
  readonly expiresAt: string
}

export interface SessionFamilyRow {
  readonly familyId: string
  readonly userId: string
  readonly role: Role
  readonly revoked: boolean
}

/**
 * The outcome of {@link SessionStore.claimRefreshToken}. Shaped like
 * `@arka/payments`' `ReserveOutcome<T>` on purpose: `claimed: false` carries
 * whatever was already there (or `null` if the hash is simply unknown), and
 * the caller decides what that means rather than the store making the call.
 */
export type ClaimRefreshTokenOutcome =
  | { readonly claimed: true; readonly row: RefreshTokenRow }
  | { readonly claimed: false; readonly existing: RefreshTokenRow | null }

export interface SessionStore {
  /** Starts a new rotation family for one login. Returns the new family id. */
  createFamily(userId: string, role: Role): Promise<string>
  getFamily(familyId: string): Promise<SessionFamilyRow | null>

  insertRefreshToken(row: RefreshTokenRow): Promise<void>

  /**
   * Atomically marks a refresh token used, in one step, so two concurrent
   * rotations of the same token cannot both see it as unused. Exactly one
   * caller gets `{ claimed: true }`; a second call for the same hash,
   * whether truly concurrent or a later replay, gets `{ claimed: false,
   * existing }`, which is the reuse signal. The same shape and the same
   * reasoning as `IdempotencyStore.reserve` in `@arka/payments`.
   */
  claimRefreshToken(tokenHash: string): Promise<ClaimRefreshTokenOutcome>

  insertAccessToken(row: AccessTokenRow): Promise<void>
  getAccessToken(tokenHash: string): Promise<AccessTokenRow | null>

  /** Revokes every token, past and future, in one family. Used when reuse is detected. */
  revokeFamily(familyId: string): Promise<void>
}
