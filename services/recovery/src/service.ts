import { appendAuditRecord, verifyAuditChain } from './audit-hash.ts'
import { AuditTrailConflictError } from './audit-trail-store.ts'
import { RecoveryError } from './types.ts'
import type { AuditRecord } from './audit-hash.ts'
import type { AuditTrailStore } from './audit-trail-store.ts'
import type { QuarantineStore } from './quarantine-store.ts'
import type { CellEndpoint, CellHealthChecker } from './cell-health.ts'
import type { CellHealthSnapshot, QuarantineRow, QuarantineStatus } from './types.ts'
import type { VerifyResult } from '@arka/ledger-core'

export interface RecoveryServiceOptions {
  readonly quarantineStore: QuarantineStore
  readonly auditTrailStore: AuditTrailStore
  readonly healthChecker: CellHealthChecker
  readonly cellEndpoints: readonly CellEndpoint[]
  /** How many times to rebuild and retry an audit append when a concurrent action wins the race. */
  readonly maxAuditAppendAttempts?: number
}

function toStatus(row: QuarantineRow): QuarantineStatus {
  return { cellId: row.cellId, state: row.state, approvedBy: row.approvedBy }
}

/**
 * The Recovery Console's control plane, for one Arka deployment. Unlike
 * every per-Cell service, this one legitimately knows about more than one
 * Cell: observing and, under dual approval, quarantining Cells is exactly
 * what a control plane is for. Framework-free, same reasoning as
 * `LedgerService`, `AccountsService`, `PaymentsService` and
 * `IdentityService`: the behaviour that decides whether a quarantine
 * request is legitimate is testable without a server or a database.
 */
export class RecoveryService {
  readonly #quarantineStore: QuarantineStore
  readonly #auditTrailStore: AuditTrailStore
  readonly #healthChecker: CellHealthChecker
  readonly #cellEndpoints: readonly CellEndpoint[]
  readonly #maxAuditAppendAttempts: number

  constructor(options: RecoveryServiceOptions) {
    this.#quarantineStore = options.quarantineStore
    this.#auditTrailStore = options.auditTrailStore
    this.#healthChecker = options.healthChecker
    this.#cellEndpoints = options.cellEndpoints
    this.#maxAuditAppendAttempts = options.maxAuditAppendAttempts ?? 5
  }

  // ---------------------------------------------------------------------
  // FR-22: quarantine with dual approval
  // ---------------------------------------------------------------------

  /**
   * Requests quarantine of a Cell (P2 in `docs/RUNBOOK.md`). The requester's
   * own call counts as the first of the two required approvals; a second,
   * distinct operator must call {@link approveQuarantine} before the Cell
   * actually goes read-only.
   */
  async requestQuarantine(cellId: string, reason: string, requestedBy: string): Promise<QuarantineStatus> {
    const outcome = await this.#quarantineStore.startPending(cellId, 'quarantine', requestedBy, reason, 'none')
    if (!outcome.started) {
      throw outcome.row.state === 'quarantined'
        ? new RecoveryError('CELL_ALREADY_QUARANTINED', `Cell "${cellId}" is already quarantined`)
        : new RecoveryError('QUARANTINE_ALREADY_PENDING', `Cell "${cellId}" already has a pending dual-approval action`)
    }

    await this.#appendAudit(requestedBy, 'quarantine.requested', cellId)
    return toStatus(outcome.row)
  }

  /**
   * A second, distinct operator approves a pending quarantine request. The
   * same operator who requested it cannot also be this approval: that is
   * enforced by {@link QuarantineStore.addApprover} rejecting a duplicate
   * operator id, not by this method inspecting who asked.
   */
  async approveQuarantine(cellId: string, approvedBy: string): Promise<QuarantineStatus> {
    const outcome = await this.#quarantineStore.addApprover(cellId, approvedBy, 'quarantine')
    if (!outcome.added) {
      throw this.#classifyApprovalFailure(outcome.row, 'quarantine', approvedBy)
    }

    const action = outcome.row.state === 'quarantined' ? 'quarantine.approved' : 'quarantine.approval_recorded'
    await this.#appendAudit(approvedBy, action, cellId)
    return toStatus(outcome.row)
  }

  /** Requests lifting an active quarantine (the reversal in P2, also dual-approval). */
  async requestLiftQuarantine(cellId: string, requestedBy: string): Promise<QuarantineStatus> {
    const outcome = await this.#quarantineStore.startPending(cellId, 'lift', requestedBy, null, 'quarantined')
    if (!outcome.started) {
      // The precondition was "currently quarantined". If that failed, the row
      // is either mid dual-approval already (pending), or was never
      // quarantined in the first place (none). It cannot be 'quarantined'
      // here: that is exactly the precondition that would have succeeded.
      throw outcome.row.state === 'pending_second_approval'
        ? new RecoveryError('QUARANTINE_ALREADY_PENDING', `Cell "${cellId}" already has a pending dual-approval action`)
        : new RecoveryError('CELL_NOT_QUARANTINED', `Cell "${cellId}" is not quarantined`)
    }

    await this.#appendAudit(requestedBy, 'lift.requested', cellId)
    return toStatus(outcome.row)
  }

  async approveLiftQuarantine(cellId: string, approvedBy: string): Promise<QuarantineStatus> {
    const outcome = await this.#quarantineStore.addApprover(cellId, approvedBy, 'lift')
    if (!outcome.added) {
      throw this.#classifyApprovalFailure(outcome.row, 'lift', approvedBy)
    }

    const action = outcome.row.state === 'none' ? 'lift.approved' : 'lift.approval_recorded'
    await this.#appendAudit(approvedBy, action, cellId)
    return toStatus(outcome.row)
  }

  #classifyApprovalFailure(row: QuarantineRow, direction: 'quarantine' | 'lift', approvedBy: string): RecoveryError {
    if (row.state !== 'pending_second_approval' || row.direction !== direction) {
      return new RecoveryError('NO_PENDING_ACTION', `Cell "${row.cellId}" has no pending ${direction} action`)
    }
    // The only other reason `addApprover` refuses while the state and
    // direction do match is its own `NOT (approved_by ? $2)` precondition.
    return new RecoveryError(
      'ALREADY_APPROVED_BY_THIS_OPERATOR',
      `Operator "${approvedBy}" already approved this action; a second, distinct operator is required`
    )
  }

  /**
   * A Cell counts as quarantined while its lift is still pending a second
   * approval, not only once it is fully back to `'none'`. Without this, a
   * single `requestLiftQuarantine` call would immediately reopen writes
   * before anyone had actually approved lifting it, defeating the entire
   * point of dual approval on the reversal.
   */
  async isQuarantined(cellId: string): Promise<boolean> {
    const row = await this.#quarantineStore.get(cellId)
    return row.state === 'quarantined' || (row.state === 'pending_second_approval' && row.direction === 'lift')
  }

  async getQuarantineStatus(cellId: string): Promise<QuarantineStatus> {
    return toStatus(await this.#quarantineStore.get(cellId))
  }

  // ---------------------------------------------------------------------
  // FR-21: live Cell health
  // ---------------------------------------------------------------------

  /**
   * Every configured Cell's status. A quarantined Cell always reports
   * `'quarantined'`, an operator decision that overrides whatever its
   * infrastructure looks like: the point of quarantine is that the Cell
   * stops serving writes regardless of how healthy its database happens to
   * be. Only an unquarantined Cell's status is actually observed.
   */
  async healthMap(): Promise<CellHealthSnapshot[]> {
    return Promise.all(this.#cellEndpoints.map((endpoint) => this.#healthOf(endpoint)))
  }

  async #healthOf(endpoint: CellEndpoint): Promise<CellHealthSnapshot> {
    if (await this.isQuarantined(endpoint.cellId)) {
      return { cellId: endpoint.cellId, status: 'quarantined', lastCheckedAt: new Date().toISOString() }
    }

    const observed = await this.#healthChecker.check(endpoint)
    return {
      cellId: observed.cellId,
      status: observed.infrastructureHealthy ? 'healthy' : 'degraded',
      lastCheckedAt: observed.lastCheckedAt,
      latencyMs: observed.latencyMs,
    }
  }

  // ---------------------------------------------------------------------
  // FR-25: append-only operator audit trail
  // ---------------------------------------------------------------------

  /** Every recorded operator action, oldest first. */
  async auditTrail(): Promise<AuditRecord[]> {
    return this.#auditTrailStore.read()
  }

  /** Walks the audit chain from genesis and reports the first break, same contract as `LedgerService.verify`. */
  async verifyAuditTrail(): Promise<VerifyResult> {
    return verifyAuditChain(await this.#auditTrailStore.read())
  }

  /**
   * Seal one operator action onto the audit chain. Optimistic concurrency,
   * identical reasoning to `LedgerService.record`: build against the head,
   * append only if it has not moved, rebuild and retry against the new head
   * if another operator action landed first.
   */
  async #appendAudit(actor: string, action: string, cellId: string | null): Promise<void> {
    let lastConflict: AuditTrailConflictError | null = null

    for (let attempt = 0; attempt < this.#maxAuditAppendAttempts; attempt++) {
      const head = await this.#auditTrailStore.head()
      const record = appendAuditRecord(head, actor, action, cellId)

      try {
        await this.#auditTrailStore.append(record, head?.seq ?? null)
        return
      } catch (error) {
        if (!(error instanceof AuditTrailConflictError)) throw error
        lastConflict = error
      }
    }

    throw lastConflict ?? new Error('Audit append failed without a recorded conflict')
  }
}
