import type { AuditRecord } from './audit-hash.ts'

/**
 * Persistence for the operator audit trail. Same shape as `LedgerStore` in
 * `@arka/ledger`, and for the same reason: append-only, optimistic
 * concurrency on `seq`, so the service can build a record against the head
 * it read and retry if another operator action landed first.
 */
export interface AuditTrailStore {
  head(): Promise<AuditRecord | null>

  /**
   * Append a record, but only if the trail has not moved since it was
   * built. Throws {@link AuditTrailConflictError} and appends nothing if
   * `expectedHeadSeq` is no longer current.
   */
  append(record: AuditRecord, expectedHeadSeq: number | null): Promise<void>

  /** Every record, in sequence order. */
  read(): Promise<AuditRecord[]>
}

export class AuditTrailConflictError extends Error {
  readonly expectedHeadSeq: number | null
  readonly actualHeadSeq: number | null

  constructor(expectedHeadSeq: number | null, actualHeadSeq: number | null) {
    super(`Audit trail head moved: expected ${expectedHeadSeq ?? 'empty'}, found ${actualHeadSeq ?? 'empty'}`)
    this.name = 'AuditTrailConflictError'
    this.expectedHeadSeq = expectedHeadSeq
    this.actualHeadSeq = actualHeadSeq
  }
}
