/**
 * Payments owns FR-09 (instant transfer) and FR-13 (idempotency: an
 * interrupted or retried payment is never executed twice). Saga
 * orchestration for multi-step flows (QR acceptance, agent cash-in/cash-out)
 * is 29 July scope; this is the single-step transfer that everything else
 * builds on.
 */

export interface TransferRequest {
  readonly idempotencyKey: string
  readonly fromAccountId: string
  readonly toAccountId: string
  readonly amount: bigint
}

/**
 * A transfer either lands, sealed in the ledger, or it throws. There is no
 * `'pending'` or `'failed'` outcome returned from this call: a single
 * transfer is one synchronous ledger append, the same reasoning that makes
 * `TransactionHistoryEntry.confirmed` in `@arka/accounts` always `true`.
 */
export interface TransferResult {
  readonly transferId: string
  readonly status: 'confirmed'
  readonly ledgerBlockSeq: number
  readonly ledgerBlockHash: string
}

export type PaymentsErrorCode =
  | 'SAME_ACCOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'DAILY_LIMIT_EXCEEDED'
  | 'STEP_UP_REQUIRED'
  | 'INVALID_LIMIT'
  | 'QR_EXPIRED'
  | 'QR_SIGNATURE_INVALID'
  | 'QR_MALFORMED'
  | 'AGENT_REQUEST_NOT_FOUND'
  | 'AGENT_REQUEST_EXPIRED'
  | 'AGENT_REQUEST_ALREADY_USED'
  | 'AGENT_OTP_INVALID'
  | 'IDEMPOTENCY_TIMEOUT'
  | 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'

export class PaymentsError extends Error {
  readonly code: PaymentsErrorCode

  constructor(code: PaymentsErrorCode, message: string) {
    super(message)
    this.name = 'PaymentsError'
    this.code = code
  }
}

/**
 * FR-12. `limit` is never absent: an account with no explicit override reads
 * back the platform default, so a caller never has to handle "no limit set"
 * as a third state.
 */
export interface DailyLimitInfo {
  readonly accountId: string
  readonly limit: bigint
  readonly spentToday: bigint
}

/**
 * FR-12. Changing a limit is a high-risk action gated by step-up, not by
 * being logged in alone.
 *
 * `stepUpVerified` is supplied by the caller, never checked here. Verifying
 * an actual step-up token is `@arka/identity`'s job; this service enforces
 * only the rule that a limit change cannot proceed without that having
 * already happened, the same separation `LedgerService` keeps from knowing
 * how a block's entries were decided on.
 */
export interface ChangeDailyLimitRequest {
  readonly accountId: string
  readonly newLimit: bigint
  readonly stepUpVerified: boolean
}

/**
 * FR-11. What a merchant's app asks the customer's app to sign over, encoded
 * into the QR code. `expiresAt` is enforced at redemption, not just carried
 * as metadata.
 */
export interface QrPaymentPayload {
  readonly merchantAccountId: string
  readonly amount: bigint
  readonly reference: string
  readonly expiresAt: string
}

/** The signed, opaque form of a `QrPaymentPayload`, as it travels inside the QR code. */
export interface SignedQrPayload {
  readonly token: string
  readonly payload: QrPaymentPayload
}

export interface RedeemQrRequest {
  readonly idempotencyKey: string
  readonly customerAccountId: string
  readonly qrToken: string
}

/**
 * FR-16: an authorised agent performs cash-in or cash-out for a customer,
 * consented by the customer's own OTP. `cash_in` credits the customer
 * (physical cash handed to the agent); `cash_out` debits the customer
 * (physical cash handed over by the agent). Either way this is a transfer
 * between the agent's own account and the customer's, the agent's account on
 * whichever side represents the agent giving up or receiving physical cash.
 */
export type AgentCashDirection = 'cash_in' | 'cash_out'

export interface RequestAgentCashOptions {
  readonly agentId: string
  readonly agentAccountId: string
  readonly customerAccountId: string
  readonly direction: AgentCashDirection
  readonly amount: bigint
}

/**
 * `otpCode` is returned to the caller, never delivered by this service: who
 * tells the customer (a notification, a display screen) is a decision for
 * whatever composes Payments with a delivery channel, the same separation
 * `changeDailyLimit`'s `stepUpVerified` already keeps from verifying an
 * actual step-up token.
 */
export interface AgentCashRequestResult {
  readonly requestId: string
  readonly otpCode: string
  readonly expiresAt: string
}

export interface CompleteAgentCashRequest {
  readonly idempotencyKey: string
  readonly requestId: string
  readonly otpCode: string
}
