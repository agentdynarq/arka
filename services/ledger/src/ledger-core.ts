/**
 * Single point of contact with @arka/ledger-core.
 *
 * Every other module in this service imports the ledger primitives from here
 * rather than reaching for the package directly, so the boundary stays in one
 * place if it ever needs an adapter.
 */
export {
  appendBlock,
  verifyChain,
  balanceOf,
  balances,
  totalPosition,
  GENESIS_PREV_HASH,
  LedgerError,
} from '@arka/ledger-core'

export type {
  Block,
  Entry,
  Direction,
  VerifyResult,
  LedgerErrorCode,
} from '@arka/ledger-core'
