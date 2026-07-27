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
}

export type PaymentsErrorCode =
  | 'SAME_ACCOUNT'
  | 'INSUFFICIENT_FUNDS'
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
