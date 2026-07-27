/**
 * The ledger service for one Cell.
 *
 * Framework-free. The HTTP layer is a thin adapter over `LedgerService`, and
 * the Postgres adapter is a thin implementation of `LedgerStore`. Everything
 * that decides whether money is recorded correctly lives here and is testable
 * without a server or a database.
 */

export { LedgerService } from './service.ts'
export type { LedgerRecord, IntegrityEvidence, LedgerServiceOptions } from './service.ts'

export { LedgerConflictError } from './store.ts'
export type { LedgerStore } from './store.ts'

export { InMemoryLedgerStore } from './memory-store.ts'
export { PgLedgerStore, isPostgresReachable } from './pg-store.ts'

export type { Block, Entry, Direction, VerifyResult, LedgerErrorCode } from './ledger-core.ts'
export { LedgerError } from './ledger-core.ts'
