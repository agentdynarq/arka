/** Transaction alerts (FR-19) and security alerts (FR-20). */
import { z } from 'zod'
import { isoTimestamp, signedAmount } from './common.ts'

export const transactionAlert = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  direction: z.enum(['debit', 'credit']),
  amount: signedAmount,
  occurredAt: isoTimestamp,
})
export type TransactionAlert = z.infer<typeof transactionAlert>

export const securityAlertKind = z.enum([
  'new_device',
  'failed_login_burst',
  'step_up_triggered',
  'account_locked',
])
export type SecurityAlertKind = z.infer<typeof securityAlertKind>

export const securityAlert = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  kind: securityAlertKind,
  occurredAt: isoTimestamp,
  detail: z.string().optional(),
})
export type SecurityAlert = z.infer<typeof securityAlert>
