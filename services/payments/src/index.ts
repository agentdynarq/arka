/**
 * Payments for one Cell. Owns FR-09 (instant transfer), FR-11 (QR
 * acceptance), FR-12 (daily limits with step-up), FR-13 (idempotency: an
 * interrupted or retried payment is never executed twice), and FR-16 (agent
 * cash-in/cash-out with OTP consent). Composed from `@arka/accounts` and
 * `@arka/ledger`'s public methods, never their storage directly.
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
  AgentCashDirection,
  RequestAgentCashOptions,
  AgentCashRequestResult,
  CompleteAgentCashRequest,
} from './types.ts'

export type { IdempotencyStore, IdempotencyRecord, ReserveOutcome } from './idempotency-store.ts'
export { InMemoryIdempotencyStore } from './memory-idempotency-store.ts'
export { PgIdempotencyStore } from './pg-idempotency-store.ts'

export type { LimitsStore } from './limits-store.ts'
export { InMemoryLimitsStore } from './memory-limits-store.ts'
export { PgLimitsStore } from './pg-limits-store.ts'

export type { AgentCashStore, AgentCashRow } from './agent-cash-store.ts'
export { InMemoryAgentCashStore } from './memory-agent-cash-store.ts'
export { PgAgentCashStore } from './pg-agent-cash-store.ts'

export type { QrRedemptionStore } from './qr-redemption-store.ts'
export { InMemoryQrRedemptionStore } from './memory-qr-redemption-store.ts'
export { PgQrRedemptionStore } from './pg-qr-redemption-store.ts'

export { signQrPayload, verifyQrPayload } from './qr.ts'
