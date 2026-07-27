import type { IdempotencyStore, IdempotencyRecord, ReserveOutcome } from './idempotency-store.ts'

/**
 * In-memory `IdempotencyStore`, used by unit tests.
 *
 * `reserve` has no `await` between reading and writing the map, so within a
 * single Node process it is atomic for the same reason a synchronous
 * check-then-set always is: nothing else can run on the event loop between
 * the two statements. That is what makes the concurrency test in
 * `test/service.test.ts` a genuine proof rather than a race that happens not
 * to lose.
 */
export class InMemoryIdempotencyStore<T> implements IdempotencyStore<T> {
  readonly #records = new Map<string, IdempotencyRecord<T>>()

  async reserve(key: string, requestFingerprint: string): Promise<ReserveOutcome<T>> {
    const existing = this.#records.get(key)
    if (existing) return { claimed: false, existing }
    this.#records.set(key, { status: 'pending', requestFingerprint, result: null })
    return { claimed: true }
  }

  async complete(key: string, result: T): Promise<void> {
    const existing = this.#records.get(key)
    if (!existing) throw new Error(`complete() called for unreserved key "${key}"`)
    this.#records.set(key, { ...existing, status: 'completed', result })
  }

  async release(key: string): Promise<void> {
    if (this.#records.get(key)?.status === 'pending') {
      this.#records.delete(key)
    }
  }

  async get(key: string): Promise<IdempotencyRecord<T> | null> {
    return this.#records.get(key) ?? null
  }
}
