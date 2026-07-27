/**
 * Accounts for one Cell. Owns FR-06 (balances and transaction history) and
 * FR-08 (ledger confirmation status). Composed from `@arka/ledger`'s public
 * methods rather than touching its storage, per "one schema per service" in
 * docs/ARCHITECTURE.md.
 */

export { AccountsService } from './service.ts'
export type { AccountsServiceOptions } from './service.ts'

export { AccountsError } from './types.ts'
export type { Account, AccountSummary, TransactionHistoryEntry, AccountsErrorCode } from './types.ts'

export type { AccountRegistry } from './registry.ts'
export { InMemoryAccountRegistry } from './memory-registry.ts'
export { PgAccountRegistry } from './pg-registry.ts'
