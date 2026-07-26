import { createHash } from 'node:crypto'
import type { Block, Entry } from './types.ts'

/**
 * The predecessor hash of the first block in a chain. Sixty-four zeros, so a
 * genesis block is distinguishable from a block whose predecessor was dropped.
 */
export const GENESIS_PREV_HASH = '0'.repeat(64)

/**
 * True when an account identifier can be recorded.
 *
 * Only emptiness is rejected. The canonical form is length-prefixed rather than
 * delimited, so no character is special and namespaced identifiers such as
 * `customer:alice` are safe.
 */
export function isValidAccount(account: string): boolean {
  return account.length > 0
}

/**
 * Length-prefix one field.
 *
 * A delimited encoding would need to forbid whichever character it delimits
 * with, and any such rule is one forgotten validation away from two different
 * records sharing a canonical form. Prefixing each field with its byte length
 * makes the encoding injective without restricting content.
 */
function field(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`
}

/**
 * The canonical byte form of a block, excluding its own hash.
 *
 * Entry order is significant and is preserved rather than sorted: the order in
 * which entries were recorded is part of the record.
 */
export function canonicalise(
  seq: number,
  prevHash: string,
  at: string,
  entries: readonly Entry[]
): string {
  const parts: string[] = [
    field(String(seq)),
    field(prevHash),
    field(at),
    field(String(entries.length)),
  ]
  for (const e of entries) {
    parts.push(field(e.account), field(e.direction), field(e.amount.toString()))
  }
  return parts.join('')
}

/** SHA-256 of the canonical form, lowercase hex. */
export function hashBlock(
  seq: number,
  prevHash: string,
  at: string,
  entries: readonly Entry[]
): string {
  return createHash('sha256')
    .update(canonicalise(seq, prevHash, at, entries), 'utf8')
    .digest('hex')
}

/** Recompute a block's hash from its own contents, ignoring the stored value. */
export function recomputeHash(block: Block): string {
  return hashBlock(block.seq, block.prevHash, block.at, block.entries)
}
