/**
 * Tracks which signed QR tokens (FR-11) have already been redeemed.
 *
 * `signQrPayload`/`verifyQrPayload` are pure and stateless: the same
 * payload always produces the same token, and verifying a token proves only
 * that it was genuinely signed and has not expired, not that it has never
 * been redeemed before. Without this store, the same scanned code could be
 * redeemed twice by calling `redeemQr` with two different idempotency keys,
 * each a real, separate transfer, since `transfer()`'s own idempotency
 * protection only ever guards a single key against itself.
 */
export interface QrRedemptionStore {
  /**
   * Atomically returns the idempotency key that holds this token's one
   * redemption claim, inserting a claim for `idempotencyKey` if none exists
   * yet. The caller compares the result to its own key: equal means this is
   * either the first redemption or a legitimate retry with the same key,
   * proceed; different means some other request already redeemed this
   * token first, reject. Keying the comparison on the idempotency key
   * rather than returning a plain boolean is what keeps a genuine retry
   * (same key, network timeout) working exactly like every other
   * idempotent call in this codebase, while still closing the
   * different-key double-redemption window.
   */
  claimOrGetOwner(tokenHash: string, idempotencyKey: string): Promise<string>
}
