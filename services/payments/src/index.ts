/**
 * Payments for one Cell. Owns FR-09 (instant transfer) and FR-13
 * (idempotency: an interrupted or retried payment is never executed twice).
 * Composed from `@arka/accounts` and `@arka/ledger`'s public methods, never
 * their storage directly.
 */

export { PaymentsService } from './service.ts'
export type { PaymentsServiceOptions } from './service.ts'

export { PaymentsError } from './types.ts'
export type { TransferRequest, TransferResult, PaymentsErrorCode } from './types.ts'

export type { IdempotencyStore, IdempotencyRecord, ReserveOutcome } from './idempotency-store.ts'
export { InMemoryIdempotencyStore } from './memory-idempotency-store.ts'
export { PgIdempotencyStore } from './pg-idempotency-store.ts'
