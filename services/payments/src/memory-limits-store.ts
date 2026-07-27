import type { LimitsStore } from './limits-store.ts'

/** In-memory `LimitsStore`, used by unit tests. */
export class InMemoryLimitsStore implements LimitsStore {
  readonly #limits = new Map<string, bigint>()

  async get(accountId: string): Promise<bigint | null> {
    return this.#limits.get(accountId) ?? null
  }

  async set(accountId: string, limit: bigint): Promise<void> {
    this.#limits.set(accountId, limit)
  }
}
