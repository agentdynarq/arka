/**
 * The Recovery Console's control plane. Owns FR-21 (live Cell health), FR-22
 * (quarantine with dual approval) and FR-25 (the append-only operator audit
 * trail). A separate trust zone from the data plane: this service holds no
 * customer data, only operator actions and Cell health observations. See
 * docs/ARCHITECTURE.md section 1.
 */

export type CellHealthStatus = 'healthy' | 'degraded' | 'quarantined'

/** Matches `packages/contracts`' `cellHealthSnapshot` shape. */
export interface CellHealthSnapshot {
  readonly cellId: string
  readonly status: CellHealthStatus
  readonly lastCheckedAt: string
  readonly latencyMs?: number
  readonly errorRate?: number
}

export type QuarantineState = 'none' | 'pending_second_approval' | 'quarantined'

/**
 * Which direction a pending dual-approval action is moving. Not part of the
 * wire contract (`QuarantineStatus` only has `state` and `approvedBy`,
 * frozen in `packages/contracts`): a lift and a quarantine both pass through
 * the identical `'pending_second_approval'` wire state, honestly, since
 * both genuinely are pending a second approval. `direction` is this
 * service's own bookkeeping for which one.
 */
export type QuarantineDirection = 'quarantine' | 'lift'

export interface QuarantineRow {
  readonly cellId: string
  readonly state: QuarantineState
  readonly direction: QuarantineDirection | null
  readonly approvedBy: readonly string[]
  readonly reason: string | null
}

/** What a caller of `RecoveryService` sees: matches `packages/contracts`' `quarantineStatus`. */
export interface QuarantineStatus {
  readonly cellId: string
  readonly state: QuarantineState
  readonly approvedBy: readonly string[]
}

export type RecoveryErrorCode =
  | 'CELL_ALREADY_QUARANTINED'
  | 'QUARANTINE_ALREADY_PENDING'
  | 'CELL_NOT_QUARANTINED'
  | 'NO_PENDING_ACTION'
  | 'ALREADY_APPROVED_BY_THIS_OPERATOR'

export class RecoveryError extends Error {
  readonly code: RecoveryErrorCode

  constructor(code: RecoveryErrorCode, message: string) {
    super(message)
    this.name = 'RecoveryError'
    this.code = code
  }
}
