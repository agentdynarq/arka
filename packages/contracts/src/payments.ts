/**
 * Money movement: instant transfer (FR-09), idempotency (FR-13), merchant QR
 * acceptance (FR-11), daily limits gated by step-up (FR-12), and agent
 * cash-in/cash-out with OTP consent (FR-16).
 */
import { z } from 'zod'
import { idempotencyKey, isoTimestamp, positiveAmount, nonNegativeAmount } from './common.ts'

/**
 * Every payment request carries an idempotency key. The same key returns the
 * same stored result and never executes twice. See docs/adr/0002.
 */
export const transferRequest = z.object({
  idempotencyKey,
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: positiveAmount,
  note: z.string().max(280).optional(),
})
export type TransferRequest = z.infer<typeof transferRequest>

export const transferStatus = z.enum(['confirmed', 'pending', 'failed'])
export type TransferStatus = z.infer<typeof transferStatus>

export const transferResult = z.object({
  transferId: z.string().min(1),
  status: transferStatus,
  ledgerBlockSeq: z.number().int().nonnegative().optional(),
})
export type TransferResult = z.infer<typeof transferResult>

/** FR-11. A signed, time-bounded payload a customer's app renders as a QR code. */
export const qrPaymentPayload = z.object({
  merchantId: z.string().min(1),
  amount: positiveAmount,
  reference: z.string().min(1),
  expiresAt: isoTimestamp,
})
export type QrPaymentPayload = z.infer<typeof qrPaymentPayload>

export const qrRedemptionRequest = z.object({
  idempotencyKey,
  qrToken: z.string().min(1),
})
export type QrRedemptionRequest = z.infer<typeof qrRedemptionRequest>

export const dailyLimitResponse = z.object({
  accountId: z.string().min(1),
  limit: positiveAmount,
  spentToday: nonNegativeAmount,
})
export type DailyLimitResponse = z.infer<typeof dailyLimitResponse>

/** Changing a limit is a high-risk action, so it is gated by a step-up token, not by MFA alone. */
export const dailyLimitChangeRequest = z.object({
  accountId: z.string().min(1),
  newLimit: positiveAmount,
  stepUpToken: z.string().min(1),
})
export type DailyLimitChangeRequest = z.infer<typeof dailyLimitChangeRequest>

/** FR-16. The customer consents by OTP, not by presence, since the agent acts on their behalf. */
export const agentCashDirection = z.enum(['cash_in', 'cash_out'])
export type AgentCashDirection = z.infer<typeof agentCashDirection>

export const agentCashRequest = z.object({
  idempotencyKey,
  agentId: z.string().min(1),
  customerId: z.string().min(1),
  direction: agentCashDirection,
  amount: positiveAmount,
  otpCode: z.string().regex(/^\d{6}$/),
})
export type AgentCashRequest = z.infer<typeof agentCashRequest>

/**
 * FR-15. A capability hint, not a payload. Services and the gateway use it to
 * decide response shape, for example whether to include a transaction list or
 * only its most recent entry.
 */
export const clientHints = z.object({
  lowBandwidth: z.boolean().optional(),
})
export type ClientHints = z.infer<typeof clientHints>
