/**
 * Accounts owns FR-06 (balances and transaction history) and FR-08 (ledger
 * confirmation status per transaction). It never stores money movement
 * itself, that is the ledger's job; it stores the metadata the ledger has no
 * concept of (which customer an account belongs to, its display name) and
 * composes that with `@arka/ledger` for the numbers.
 */

/** An account as this service knows it. `accountId` is the same string the ledger records entries against. */
export interface Account {
  readonly accountId: string
  readonly customerId: string
  readonly displayName: string
  readonly openedAt: string
}

/** FR-06: what a customer sees when they view an account. */
export interface AccountSummary {
  readonly accountId: string
  readonly customerId: string
  readonly displayName: string
  readonly balance: bigint
}

/**
 * FR-08: one line of transaction history, with its ledger confirmation
 * status. `confirmed` is always `true` in this design: a ledger write is a
 * single synchronous transaction against the Cell's Postgres, so if a record
 * can be read back at all, it was durably committed. There is no
 * partially-written or pending state for a single ledger append to be in.
 * A saga spanning multiple ledger writes (Payments, FR-13) can still be
 * mid-flight, but that is a property of the saga, not of any one entry.
 */
export interface TransactionHistoryEntry {
  readonly seq: number
  readonly at: string
  readonly direction: 'debit' | 'credit'
  readonly amount: bigint
  readonly counterpartyHint: string
  readonly ledgerBlockHash: string
  readonly confirmed: true
}

export type AccountsErrorCode = 'ACCOUNT_NOT_FOUND' | 'ACCOUNT_ALREADY_EXISTS' | 'INVALID_DISPLAY_NAME'

export class AccountsError extends Error {
  readonly code: AccountsErrorCode

  constructor(code: AccountsErrorCode, message: string) {
    super(message)
    this.name = 'AccountsError'
    this.code = code
  }
}
