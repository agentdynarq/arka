/**
 * FR-22: whether this Cell is currently quarantined, asked of `apps/recovery`
 * directly, keyed by the Cell id this process already knows from its own
 * `CELL_ID` env var. Deliberately not routed through `apps/gateway`'s
 * customer-keyed `write-check` endpoint: that re-derives a Cell from a
 * customer id via the Cell Router's hash, which can disagree with the Cell
 * this process actually is (see arka-ops/LOG.md, 28 July, on the Cell
 * Router's own reshuffle caveat) — asking about a Cell this process already
 * knows unambiguously avoids that indirection entirely.
 *
 * Fails closed: if the check itself cannot be completed (network error,
 * timeout, a non-2xx response), `isQuarantined` throws rather than assuming
 * "not quarantined". A write proceeding because a safety check could not be
 * reached is exactly the failure mode this exists to prevent.
 *
 * Unauthenticated for now: `apps/recovery`'s `GET :cellId` status endpoint
 * is also called directly, unauthenticated, from the browser by `apps/console`
 * (W5's health map), so it cannot be gated behind `@arka/workload-auth`
 * without breaking that screen. Same accepted gap `apps/gateway`'s
 * `write-check` endpoint already has; not solved by this fix, flagged here
 * rather than silently left.
 */
export interface QuarantineChecker {
  isQuarantined(cellId: string): Promise<boolean>
}

/**
 * The DI token `QuarantineGuard` injects this behind. A string, not the
 * `QuarantineChecker` interface itself (interfaces have no runtime value to
 * key a provider on). Lives in this file, not `quarantine.guard.ts`, so
 * tests can import it without loading a file that uses NestJS parameter
 * properties: Node's `--experimental-strip-types` strips types, it does not
 * transform decorators, so a raw import of a decorated class fails exactly
 * the way an unbuilt one would.
 */
export const QUARANTINE_CHECKER = 'QUARANTINE_CHECKER'

export interface HttpQuarantineCheckerOptions {
  readonly recoveryUrl: string
  readonly timeoutMs?: number
}

export class HttpQuarantineChecker implements QuarantineChecker {
  readonly #recoveryUrl: string
  readonly #timeoutMs: number

  constructor(options: HttpQuarantineCheckerOptions) {
    this.#recoveryUrl = options.recoveryUrl.replace(/\/$/, '')
    this.#timeoutMs = options.timeoutMs ?? 2000
  }

  async isQuarantined(cellId: string): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs)

    try {
      const response = await fetch(`${this.#recoveryUrl}/v1/recovery/quarantine/${encodeURIComponent(cellId)}`, {
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`quarantine status check returned ${response.status}`)
      }
      const status = (await response.json()) as { state?: unknown }
      return status.state === 'quarantined'
    } finally {
      clearTimeout(timeout)
    }
  }
}
