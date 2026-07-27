import { IdentityError } from './types.ts'
import type { CustomerRecord } from './types.ts'
import type { UserStore } from './user-store.ts'

/** In-memory `UserStore`, used by unit tests. */
export class InMemoryUserStore implements UserStore {
  readonly #byId = new Map<string, CustomerRecord>()
  readonly #byUsername = new Map<string, string>()

  async create(user: CustomerRecord): Promise<void> {
    if (this.#byUsername.has(user.username)) {
      throw new IdentityError('USERNAME_ALREADY_EXISTS', `Username "${user.username}" already exists`)
    }
    this.#byId.set(user.userId, user)
    this.#byUsername.set(user.username, user.userId)
  }

  async getByUsername(username: string): Promise<CustomerRecord | null> {
    const userId = this.#byUsername.get(username)
    return userId ? (this.#byId.get(userId) ?? null) : null
  }

  async getById(userId: string): Promise<CustomerRecord | null> {
    return this.#byId.get(userId) ?? null
  }

  async incrementFailedLogins(userId: string): Promise<number> {
    const user = this.#require(userId)
    const updated = { ...user, failedLoginCount: user.failedLoginCount + 1 }
    this.#byId.set(userId, updated)
    return updated.failedLoginCount
  }

  async resetFailedLogins(userId: string): Promise<void> {
    const user = this.#require(userId)
    this.#byId.set(userId, { ...user, failedLoginCount: 0 })
  }

  async setLockedUntil(userId: string, lockedUntil: string | null): Promise<void> {
    const user = this.#require(userId)
    this.#byId.set(userId, { ...user, lockedUntil })
  }

  #require(userId: string): CustomerRecord {
    const user = this.#byId.get(userId)
    if (!user) throw new Error(`no such user "${userId}"`)
    return user
  }
}
