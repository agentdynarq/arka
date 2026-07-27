import type { Block } from './ledger-core.ts'

/**
 * Persistence for one Cell's ledger.
 *
 * The interface is async because the real implementation is Postgres. Keeping
 * the service written against this port rather than against a driver is what
 * lets the whole thing be tested without infrastructure, and it is the seam the
 * Postgres adapter drops into once the Cell databases exist.
 *
 * Implementations must be append-only. There is no update and no delete, and
 * adding one would defeat the point of the chain.
 */
export interface LedgerStore {
  /** The most recently appended block, or null on an empty chain. */
  head(): Promise<Block | null>

  /**
   * Append a block, but only if the chain has not moved since it was built.
   *
   * `expectedHeadSeq` is the sequence number the caller believed was current,
   * or null if it believed the chain was empty. If that is no longer true the
   * implementation must throw {@link LedgerConflictError} and append nothing.
   * This is optimistic concurrency, and it is what stops two concurrent writers
   * both claiming the same sequence number.
   */
  append(block: Block, expectedHeadSeq: number | null): Promise<void>

  /** Blocks in sequence order. `from` and `to` are inclusive sequence numbers. */
  read(range?: { from?: number; to?: number }): Promise<Block[]>

  /** Total blocks in the chain. */
  count(): Promise<number>
}

/**
 * Thrown when a block was built against a head that is no longer current.
 *
 * The caller can safely rebuild against the new head and retry, because nothing
 * was written.
 */
export class LedgerConflictError extends Error {
  readonly expectedHeadSeq: number | null
  readonly actualHeadSeq: number | null

  constructor(expectedHeadSeq: number | null, actualHeadSeq: number | null) {
    super(
      `Ledger head moved: expected ${expectedHeadSeq ?? 'empty chain'}, found ${actualHeadSeq ?? 'empty chain'}`
    )
    this.name = 'LedgerConflictError'
    this.expectedHeadSeq = expectedHeadSeq
    this.actualHeadSeq = actualHeadSeq
  }
}
