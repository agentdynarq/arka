/**
 * Payments for one Cell. Owns FR-09 (instant transfer), FR-11 (QR
 * acceptance), FR-12 (daily limits with step-up), and FR-13 (idempotency:
 * an interrupted or retried payment is never executed twice). Composed from
 * `@arka/accounts` and `@arka/ledger`'s public methods, never their storage
 * directly.
 */

export { PaymentsService } from './service.ts'
export type { PaymentsServiceOptions } from './service.ts'

export { PaymentsError } from './types.ts'
export type {
  TransferRequest,
  TransferResult,
  PaymentsErrorCode,
  DailyLimitInfo,
  ChangeDailyLimitRequest,
  QrPaymentPayload,
  SignedQrPayload,
  RedeemQrRequest,
} from './types.ts'

export type { IdempotencyStore, IdempotencyRecord, ReserveOutcome } from './idempotency-store.ts'
export { InMemoryIdempotencyStore } from './memory-idempotency-store.ts'
export { PgIdempotencyStore } from './pg-idempotency-store.ts'

export type { LimitsStore } from './limits-store.ts'
export { InMemoryLimitsStore } from './memory-limits-store.ts'
export { PgLimitsStore } from './pg-limits-store.ts'

export { signQrPayload, verifyQrPayload } from './qr.ts'
