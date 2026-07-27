/**
 * The Recovery Console's control plane. Owns FR-21 (live Cell health),
 * FR-22 (quarantine with dual approval), FR-23 (on-demand ledger integrity
 * verification with export) and FR-25 (the append-only operator audit
 * trail). Framework-free: `apps/recovery` is a thin HTTP adapter over
 * `RecoveryService`, and the Postgres adapters are thin implementations of
 * each store port.
 */

export { RecoveryService } from './service.ts'
export type { RecoveryServiceOptions } from './service.ts'

export { RecoveryError } from './types.ts'
export type {
  CellHealthStatus,
  CellHealthSnapshot,
  QuarantineState,
  QuarantineDirection,
  QuarantineRow,
  QuarantineStatus,
  RecoveryErrorCode,
} from './types.ts'

export {
  GENESIS_PREV_HASH,
  appendAuditRecord,
  verifyAuditChain,
  canonicaliseAuditRecord,
  hashAuditRecord,
  recomputeAuditHash,
} from './audit-hash.ts'
export type { AuditRecord } from './audit-hash.ts'

export type { QuarantineStore } from './quarantine-store.ts'
export { InMemoryQuarantineStore } from './memory-quarantine-store.ts'
export { PgQuarantineStore } from './pg-quarantine-store.ts'

export { AuditTrailConflictError } from './audit-trail-store.ts'
export type { AuditTrailStore } from './audit-trail-store.ts'
export { InMemoryAuditTrailStore } from './memory-audit-trail-store.ts'
export { PgAuditTrailStore } from './pg-audit-trail-store.ts'

export type { CellEndpoint, CellHealthChecker } from './cell-health.ts'
export { InfrastructureCellHealthChecker } from './cell-health.ts'
export { isRedisReachable } from './redis-health.ts'

export type { LedgerIntegrityChecker } from './ledger-integrity.ts'
export { PgLedgerIntegrityChecker } from './ledger-integrity.ts'
