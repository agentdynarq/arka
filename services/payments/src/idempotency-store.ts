/**
 * Generic idempotency-key storage, parameterised over the result type a
 * caller wants replayed. `@arka/payments` uses it for `TransferResult`; a
 * future agent cash-in/cash-out flow (FR-16, 30 July scope) can reuse it
 * unchanged for its own result type.
 */
export interface IdempotencyRecord<T> {
  readonly status: 'pending' | 'completed'
  /** A stable fingerprint of the request that first claimed this key. See `fingerprintOf` in service.ts. */
  readonly requestFingerprint: string
  readonly result: T | null
}

export type ReserveOutcome<T> = { readonly claimed: true } | { readonly claimed: false; readonly existing: IdempotencyRecord<T> }

export interface IdempotencyStore<T> {
  /**
   * Atomically claim `key` for one request. Exactly one concurrent caller
   * gets `{ claimed: true }`; every other caller, whether truly concurrent or
   * a later retry, gets `{ claimed: false, existing }` and must not execute
   * the operation again.
   */
  reserve(key: string, requestFingerprint: string): Promise<ReserveOutcome<T>>

  /** Record the outcome of the operation the claimant ran. */
  complete(key: string, result: T): Promise<void>

  /**
   * Release a claim that failed before completing, so the same key can be
   * retried. Only removes a still-`pending` record: a completed one is never
   * released, since that would let a legitimate replay re-execute.
   */
  release(key: string): Promise<void>

  get(key: string): Promise<IdempotencyRecord<T> | null>
}
