/**
 * Core ledger types.
 *
 * Money is `bigint` in minor units everywhere in this package. There is no
 * floating point representation of money, in calculation, transport or storage.
 * See docs/adr/0002.
 */

/** Which side of a double-entry record an amount falls on. */
export type Direction = 'debit' | 'credit'

/**
 * A single debit or credit against one account.
 *
 * `amount` is in minor units and is always strictly positive. Direction carries
 * the sign, so a negative amount is a malformed entry rather than a reversal.
 */
export interface Entry {
  readonly account: string
  readonly direction: Direction
  readonly amount: bigint
}

/**
 * One append to the ledger.
 *
 * Every block balances: the sum of its debits equals the sum of its credits.
 * `prevHash` links it to its predecessor, and `hash` covers everything above,
 * so altering any field breaks verification from this block onward.
 */
export interface Block {
  readonly seq: number
  readonly prevHash: string
  readonly entries: readonly Entry[]
  /** ISO 8601, UTC, millisecond precision. */
  readonly at: string
  readonly hash: string
}

/**
 * The outcome of walking a chain.
 *
 * A break reports where, not merely that. `brokenAt` is the index of the first
 * block that failed and `reason` says what about it failed, because an operator
 * following the runbook under pressure needs both.
 */
export interface VerifyResult {
  readonly ok: boolean
  readonly records: number
  readonly rootHash: string | null
  readonly brokenAt?: number
  readonly reason?: string
}

/** Reasons a chain or an append can be rejected. */
export type LedgerErrorCode =
  | 'EMPTY_ENTRIES'
  | 'NON_POSITIVE_AMOUNT'
  | 'UNBALANCED_BLOCK'
  | 'INVALID_ACCOUNT'
  | 'INVALID_DIRECTION'
  | 'INVALID_TIMESTAMP'

/** Thrown when an append would produce a block that violates an invariant. */
export class LedgerError extends Error {
  readonly code: LedgerErrorCode

  constructor(code: LedgerErrorCode, message: string) {
    super(message)
    this.name = 'LedgerError'
    this.code = code
  }
}
