/**
 * ledger-core
 *
 * The append-only, hash-chained, double-entry ledger that is Arka's single
 * source of financial truth. Everything else in the platform is a rebuildable
 * projection of what this package records.
 *
 * Zero runtime dependencies, deliberately. This is the code that backs the
 * boldest claim in the blueprint, so it is small enough to read in one sitting
 * and testable without any infrastructure. See docs/adr/0002.
 */

export type {
  Direction,
  Entry,
  Block,
  VerifyResult,
  LedgerErrorCode,
} from './types.ts'
export { LedgerError } from './types.ts'

export { appendBlock, verifyChain } from './chain.ts'
export { balanceOf, balances, totalPosition } from './balance.ts'
export { GENESIS_PREV_HASH, canonicalise, hashBlock, recomputeHash, isValidAccount } from './hash.ts'
