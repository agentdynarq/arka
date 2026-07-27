/**
 * Generic fixed-window rate limiting, keyed by caller. `IdentityService` uses
 * it for login attempts (`login:<username>`), keyed separately from the
 * per-account lockout in `UserStore`: rate limiting throttles a burst
 * regardless of whether the username exists, lockout only ever applies to a
 * real account after repeated genuine failures. Same generic-over-a-key
 * reasoning as `IdempotencyStore<T>` in `@arka/payments`.
 */
export interface RateLimitOutcome {
  readonly allowed: boolean
  /** Milliseconds until the current window closes, present when `allowed` is `false`. */
  readonly retryAfterMs?: number
}

export interface RateLimiter {
  /** Records one hit for `key` now and reports whether it is still within `limit` hits per `windowMs`. */
  hit(key: string, limit: number, windowMs: number): Promise<RateLimitOutcome>
}
