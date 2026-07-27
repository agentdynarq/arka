/**
 * The append-only, hash-chained operator audit trail (FR-25). "Same
 * primitive is reused for the operator audit trail" (see `CLAUDE.md`'s hard
 * invariants): the primitive is the pattern, prevHash linkage plus a
 * recomputable SHA-256 over canonical, length-prefixed fields, and the
 * genesis sentinel, all taken directly from `@arka/ledger-core`.
 *
 * A literal `Entry`/`Block` from `@arka/ledger-core` is not reused as the
 * record shape: those types require a `direction` and a strictly positive
 * `amount` and enforce that a block's debits equal its credits, none of
 * which describes an operator action ("quarantine cell-1", "approve
 * quarantine"). Forcing an audit record through the money-balanced shape
 * would mean inventing a fake debit and credit for every entry, which is a
 * worse kind of dishonesty than writing ten lines of parallel code. What is
 * genuinely shared, `GENESIS_PREV_HASH` and the `VerifyResult` wire shape,
 * is imported directly rather than redefined.
 */
import { createHash } from 'node:crypto'
import { GENESIS_PREV_HASH } from '@arka/ledger-core'
import type { VerifyResult } from '@arka/ledger-core'

export { GENESIS_PREV_HASH }

/** One entry in the operator audit trail. Every field is covered by `hash`. */
export interface AuditRecord {
  readonly seq: number
  readonly prevHash: string
  readonly actor: string
  readonly action: string
  readonly cellId: string | null
  /** ISO 8601, UTC, millisecond precision. Same format ledger-core requires of `Block.at`. */
  readonly occurredAt: string
  readonly hash: string
}

/** Length-prefix one field, same encoding as `ledger-core`'s `canonicalise`, so no delimiter is ever special. */
function field(value: string): string {
  return `${Buffer.byteLength(value, 'utf8')}:${value}`
}

export function canonicaliseAuditRecord(
  seq: number,
  prevHash: string,
  actor: string,
  action: string,
  cellId: string | null,
  occurredAt: string
): string {
  return [
    field(String(seq)),
    field(prevHash),
    field(actor),
    field(action),
    field(cellId ?? ''),
    field(occurredAt),
  ].join('')
}

/** SHA-256 of the canonical form, lowercase hex. */
export function hashAuditRecord(
  seq: number,
  prevHash: string,
  actor: string,
  action: string,
  cellId: string | null,
  occurredAt: string
): string {
  return createHash('sha256')
    .update(canonicaliseAuditRecord(seq, prevHash, actor, action, cellId, occurredAt), 'utf8')
    .digest('hex')
}

/** Recompute a record's hash from its own contents, ignoring the stored value. */
export function recomputeAuditHash(record: AuditRecord): string {
  return hashAuditRecord(record.seq, record.prevHash, record.actor, record.action, record.cellId, record.occurredAt)
}

/**
 * Seal one operator action onto the chain. Pass `null` as `prev` to open the
 * chain. Unlike `appendBlock`, there is no entry validation to perform
 * beyond what the type system already guarantees: an operator action has no
 * balance invariant to violate.
 */
export function appendAuditRecord(
  prev: AuditRecord | null,
  actor: string,
  action: string,
  cellId: string | null,
  occurredAt: string = new Date().toISOString()
): AuditRecord {
  const seq = prev === null ? 0 : prev.seq + 1
  const prevHash = prev === null ? GENESIS_PREV_HASH : prev.hash

  return {
    seq,
    prevHash,
    actor,
    action,
    cellId,
    occurredAt,
    hash: hashAuditRecord(seq, prevHash, actor, action, cellId, occurredAt),
  }
}

/**
 * Walk the audit chain from genesis and report the first break, same
 * contract as `verifyChain`: an empty trail verifies clean with a null root
 * hash, and a break reports the index it was found at, not merely that one
 * exists.
 */
export function verifyAuditChain(records: readonly AuditRecord[]): VerifyResult {
  if (records.length === 0) {
    return { ok: true, records: 0, rootHash: null }
  }

  for (let i = 0; i < records.length; i++) {
    const record = records[i]!
    const prev = i === 0 ? null : records[i - 1]!

    const expectedSeq = prev === null ? 0 : prev.seq + 1
    if (record.seq !== expectedSeq) {
      return broken(i, `Expected seq ${expectedSeq}, found ${record.seq}`)
    }

    const expectedPrevHash = prev === null ? GENESIS_PREV_HASH : prev.hash
    if (record.prevHash !== expectedPrevHash) {
      return broken(i, 'Predecessor hash does not match the previous record')
    }

    if (recomputeAuditHash(record) !== record.hash) {
      return broken(i, 'Record contents do not match its recorded hash')
    }
  }

  return {
    ok: true,
    records: records.length,
    rootHash: records[records.length - 1]!.hash,
  }
}

function broken(index: number, reason: string): VerifyResult {
  return { ok: false, records: index, rootHash: null, brokenAt: index, reason }
}
