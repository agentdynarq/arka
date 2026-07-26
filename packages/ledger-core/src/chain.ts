import { GENESIS_PREV_HASH, isValidAccount, recomputeHash, hashBlock } from './hash.ts'
import { LedgerError } from './types.ts'
import type { Block, Entry, VerifyResult } from './types.ts'

/** Sum of entries on one side of a block. */
function sumOf(entries: readonly Entry[], direction: Entry['direction']): bigint {
  let total = 0n
  for (const e of entries) {
    if (e.direction === direction) total += e.amount
  }
  return total
}

/**
 * Reject anything that would produce a malformed block.
 *
 * This runs before a block exists rather than during verification, so a bad
 * entry can never enter the chain in the first place.
 */
function assertValidEntries(entries: readonly Entry[]): void {
  if (entries.length === 0) {
    throw new LedgerError('EMPTY_ENTRIES', 'A block must contain at least one entry')
  }

  for (const e of entries) {
    if (!isValidAccount(e.account)) {
      throw new LedgerError('INVALID_ACCOUNT', 'Account identifier must not be empty')
    }
    if (e.direction !== 'debit' && e.direction !== 'credit') {
      throw new LedgerError('INVALID_DIRECTION', `Unknown direction "${String(e.direction)}"`)
    }
    if (typeof e.amount !== 'bigint') {
      throw new LedgerError(
        'NON_POSITIVE_AMOUNT',
        `Amount for "${e.account}" must be a bigint in minor units`
      )
    }
    if (e.amount <= 0n) {
      throw new LedgerError(
        'NON_POSITIVE_AMOUNT',
        `Amount for "${e.account}" must be strictly positive. Direction carries the sign`
      )
    }
  }

  const debits = sumOf(entries, 'debit')
  const credits = sumOf(entries, 'credit')
  if (debits !== credits) {
    throw new LedgerError(
      'UNBALANCED_BLOCK',
      `Block does not balance: debits ${debits}, credits ${credits}`
    )
  }
}

/** ISO 8601 with millisecond precision, in UTC. */
function assertValidTimestamp(at: string): void {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(at) || Number.isNaN(Date.parse(at))) {
    throw new LedgerError(
      'INVALID_TIMESTAMP',
      `Timestamp "${at}" must be ISO 8601 UTC with millisecond precision`
    )
  }
}

/**
 * Append a block to a chain.
 *
 * Pass `null` as `prev` to open a chain. The returned block is sealed: its hash
 * covers its sequence number, predecessor, timestamp and entries, so any later
 * alteration is detectable by {@link verifyChain}.
 *
 * Throws {@link LedgerError} rather than returning an invalid block, because an
 * unbalanced block should never reach storage.
 */
export function appendBlock(
  prev: Block | null,
  entries: readonly Entry[],
  at: string = new Date().toISOString()
): Block {
  assertValidEntries(entries)
  assertValidTimestamp(at)

  const seq = prev === null ? 0 : prev.seq + 1
  const prevHash = prev === null ? GENESIS_PREV_HASH : prev.hash
  const frozen = entries.map((e) => ({ ...e }))

  return {
    seq,
    prevHash,
    entries: frozen,
    at,
    hash: hashBlock(seq, prevHash, at, frozen),
  }
}

/**
 * Walk a chain from genesis and report the first break.
 *
 * An empty chain is valid and verifies clean with a null root hash: a bank that
 * has recorded nothing has recorded nothing incorrectly.
 */
export function verifyChain(blocks: readonly Block[]): VerifyResult {
  if (blocks.length === 0) {
    return { ok: true, records: 0, rootHash: null }
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!
    const prev = i === 0 ? null : blocks[i - 1]!

    const expectedSeq = prev === null ? 0 : prev.seq + 1
    if (block.seq !== expectedSeq) {
      return broken(i, `Expected seq ${expectedSeq}, found ${block.seq}`)
    }

    const expectedPrevHash = prev === null ? GENESIS_PREV_HASH : prev.hash
    if (block.prevHash !== expectedPrevHash) {
      return broken(i, 'Predecessor hash does not match the previous block')
    }

    if (sumOf(block.entries, 'debit') !== sumOf(block.entries, 'credit')) {
      return broken(i, 'Block does not balance')
    }

    if (recomputeHash(block) !== block.hash) {
      return broken(i, 'Block contents do not match its recorded hash')
    }
  }

  return {
    ok: true,
    records: blocks.length,
    rootHash: blocks[blocks.length - 1]!.hash,
  }
}

function broken(index: number, reason: string): VerifyResult {
  return { ok: false, records: index, rootHash: null, brokenAt: index, reason }
}
