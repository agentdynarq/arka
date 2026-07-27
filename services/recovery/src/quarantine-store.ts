import type { QuarantineDirection, QuarantineRow, QuarantineState } from './types.ts'

/**
 * Low-level quarantine storage, one row per Cell. Deliberately dumb, same
 * separation `SessionStore` keeps in `@arka/identity`: this port has no
 * notion of "dual approval", only the atomic primitives that property is
 * built from. Every method here either succeeds atomically or reports the
 * current row unchanged; there is no read-then-write pair for a caller to
 * race against.
 */
export interface QuarantineStore {
  /** Creates the row for a Cell if it does not exist yet, state `'none'`. Idempotent. */
  ensureRow(cellId: string): Promise<QuarantineRow>

  get(cellId: string): Promise<QuarantineRow>

  /**
   * Atomically starts a pending dual-approval action, but only if the row's
   * current state matches `expectedState` (`'none'` to request quarantine,
   * `'quarantined'` to request a lift). `requestedBy`'s own request counts
   * as the first approval, which is why a second, distinct operator is all
   * that is needed to finalise.
   */
  startPending(
    cellId: string,
    direction: QuarantineDirection,
    requestedBy: string,
    reason: string | null,
    expectedState: QuarantineState
  ): Promise<{ readonly started: boolean; readonly row: QuarantineRow }>

  /**
   * Atomically adds a distinct approver to the pending action matching
   * `direction`. Rejects (no-op) if the row is not pending that direction,
   * or if `approvedBy` already approved it. Finalises the action (state
   * moves to `'quarantined'` or back to `'none'`) the moment a second
   * distinct approver is recorded.
   */
  addApprover(
    cellId: string,
    approvedBy: string,
    direction: QuarantineDirection
  ): Promise<{ readonly added: boolean; readonly row: QuarantineRow }>
}
