import type { CustomerRecord } from './types.ts'

/**
 * Where login credentials live. Deliberately separate from `@arka/accounts`:
 * that package owns account metadata (display name, which customer an
 * account belongs to), this one owns who is allowed to authenticate as that
 * customer, per "one schema per service" in `docs/ARCHITECTURE.md`.
 *
 * Lockout state (`failedLoginCount`, `lockedUntil`) lives on the record and
 * is mutated through dedicated methods rather than a generic `update`, so an
 * implementation can make the read-modify-write atomic (a single `UPDATE`
 * with a computed column) instead of racing a read against a write.
 */
export interface UserStore {
  create(user: CustomerRecord): Promise<void>
  getByUsername(username: string): Promise<CustomerRecord | null>
  getById(userId: string): Promise<CustomerRecord | null>

  /** Atomically increments the failed-login counter and returns the new count. */
  incrementFailedLogins(userId: string): Promise<number>

  /** Resets the failed-login counter to zero, called on a successful login. */
  resetFailedLogins(userId: string): Promise<void>

  /** Sets or clears (`null`) the lockout expiry. */
  setLockedUntil(userId: string, lockedUntil: string | null): Promise<void>
}
