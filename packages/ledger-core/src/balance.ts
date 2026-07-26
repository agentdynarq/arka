import type { Block } from './types.ts'

/**
 * The signed position of one account, replayed from genesis.
 *
 * Returns credits minus debits, in minor units. For a customer deposit account,
 * which is a liability of the bank, that is the balance the customer sees: money
 * in is a credit. Asset-side accounts read the sign inversely, and interpreting
 * that is the caller's job rather than this package's.
 *
 * This is the definition of truth. Any stored balance is a projection, and a
 * projection that disagrees with this function is wrong.
 */
export function balanceOf(blocks: readonly Block[], account: string): bigint {
  let total = 0n
  for (const block of blocks) {
    for (const entry of block.entries) {
      if (entry.account !== account) continue
      total += entry.direction === 'credit' ? entry.amount : -entry.amount
    }
  }
  return total
}

/**
 * Every account's position in one pass.
 *
 * Rebuilding a whole projection is a single walk rather than one walk per
 * account, which is what makes replay after a Cell rebuild cheap enough to be
 * routine. See docs/RUNBOOK.md, P3.
 */
export function balances(blocks: readonly Block[]): Map<string, bigint> {
  const out = new Map<string, bigint>()
  for (const block of blocks) {
    for (const entry of block.entries) {
      const current = out.get(entry.account) ?? 0n
      out.set(entry.account, current + (entry.direction === 'credit' ? entry.amount : -entry.amount))
    }
  }
  return out
}

/**
 * The sum of every position in the chain, which is always zero.
 *
 * Double entry means each block balances, so the whole ledger balances. A
 * non-zero result means a block was accepted that should not have been, and is
 * a defect in this package rather than in the data.
 */
export function totalPosition(blocks: readonly Block[]): bigint {
  let total = 0n
  for (const value of balances(blocks).values()) total += value
  return total
}
