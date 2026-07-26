import { appendBlock } from '../src/chain.ts'
import type { Block, Entry } from '../src/types.ts'

/** Deterministic timestamps, so a chain built twice hashes identically. */
export function at(seconds: number): string {
  return new Date(Date.UTC(2066, 0, 1, 0, 0, seconds)).toISOString()
}

/** The two entries of a transfer: the sender is debited, the receiver credited. */
export function transfer(from: string, to: string, amount: bigint): Entry[] {
  return [
    { account: from, direction: 'debit', amount },
    { account: to, direction: 'credit', amount },
  ]
}

/** Build a chain by appending each set of entries in order. */
export function chainOf(entrySets: readonly Entry[][]): Block[] {
  const blocks: Block[] = []
  let prev: Block | null = null
  entrySets.forEach((entries, i) => {
    prev = appendBlock(prev, entries, at(i))
    blocks.push(prev)
  })
  return blocks
}

/** A deep copy, so a test can tamper with history the way an attacker would. */
export function clone(blocks: readonly Block[]): Block[] {
  return blocks.map((b) => ({ ...b, entries: b.entries.map((e) => ({ ...e })) }))
}

/** A small chain used across several suites. */
export function sampleChain(): Block[] {
  return chainOf([
    transfer('bank:reserve', 'customer:alice', 500_00n),
    transfer('bank:reserve', 'customer:bob', 300_00n),
    transfer('customer:alice', 'customer:bob', 125_00n),
    transfer('customer:bob', 'merchant:kade', 50_00n),
  ])
}
