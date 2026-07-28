import type { QrRedemptionStore } from './qr-redemption-store.ts'

/** In-memory `QrRedemptionStore`, used by unit tests. */
export class InMemoryQrRedemptionStore implements QrRedemptionStore {
  readonly #owners = new Map<string, string>()

  async claimOrGetOwner(tokenHash: string, idempotencyKey: string): Promise<string> {
    // No `await` between the check and the write, same reasoning as
    // `InMemoryAgentCashStore.consume`: nothing else runs on the event loop
    // between the two statements, so this is atomic within one process.
    const existing = this.#owners.get(tokenHash)
    if (existing !== undefined) return existing
    this.#owners.set(tokenHash, idempotencyKey)
    return idempotencyKey
  }
}
