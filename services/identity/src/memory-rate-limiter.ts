import type { RateLimitOutcome, RateLimiter } from './rate-limiter.ts'

/** In-memory `RateLimiter`, used by unit tests. */
export class InMemoryRateLimiter implements RateLimiter {
  readonly #windows = new Map<string, { windowStart: number; count: number }>()

  async hit(key: string, limit: number, windowMs: number): Promise<RateLimitOutcome> {
    const now = Date.now()
    const windowStart = Math.floor(now / windowMs) * windowMs
    const existing = this.#windows.get(key)

    const count = existing && existing.windowStart === windowStart ? existing.count + 1 : 1
    this.#windows.set(key, { windowStart, count })

    if (count > limit) {
      return { allowed: false, retryAfterMs: windowStart + windowMs - now }
    }
    return { allowed: true }
  }
}
