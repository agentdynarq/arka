/** Real-time balances and transaction history (FR-06), with ledger confirmation status (FR-08). */
import { z } from 'zod'
import { cellId, isoTimestamp, nonNegativeAmount, signedAmount } from './common.ts'
import { paginated } from './common.ts'

export const balanceResponse = z.object({
  accountId: z.string().min(1),
  cellId,
  balance: nonNegativeAmount,
  asOf: isoTimestamp,
})
export type BalanceResponse = z.infer<typeof balanceResponse>

/**
 * A transaction is confirmed only once its block is in the ledger. `pending`
 * exists because the ledger append and the client's view of it are not the
 * same instant, not because Arka has an uncommitted notion of money moved.
 */
export const ledgerConfirmationStatus = z.enum(['pending', 'confirmed', 'failed'])
export type LedgerConfirmationStatus = z.infer<typeof ledgerConfirmationStatus>

export const transactionHistoryItem = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  direction: z.enum(['debit', 'credit']),
  amount: signedAmount,
  counterparty: z.string().min(1).optional(),
  occurredAt: isoTimestamp,
  ledgerStatus: ledgerConfirmationStatus,
})
export type TransactionHistoryItem = z.infer<typeof transactionHistoryItem>

export const transactionHistoryResponse = paginated(transactionHistoryItem)
