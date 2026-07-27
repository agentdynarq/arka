import { appendBlock, verifyChain, balanceOf, balances } from './ledger-core.ts'
import { LedgerConflictError } from './store.ts'
import type { LedgerStore } from './store.ts'
import type { Block, Entry, VerifyResult } from './ledger-core.ts'

/**
 * One entry touching the queried account, carried with the block that sealed
 * it. Backs FR-06 and FR-08.
 *
 * `blockEntries` is every entry in that same block, not only the one that
 * matched. A block balances, so a two-party transfer's other side is always
 * in here, which is what lets a caller show a transaction's counterparty
 * without re-querying the ledger.
 */
export interface LedgerRecord {
  readonly seq: number
  readonly at: string
  readonly hash: string
  readonly entry: Entry
  readonly blockEntries: readonly Entry[]
}

/** The exportable output of an integrity verification. Backs FR-23. */
export interface IntegrityEvidence {
  readonly cellId: string
  readonly verifiedAt: string
  readonly upTo: number | null
  readonly result: VerifyResult
}

export interface LedgerServiceOptions {
  readonly cellId: string
  /** How many times to rebuild and retry when a concurrent write wins the race. */
  readonly maxAppendAttempts?: number
}

/**
 * The ledger of one Cell.
 *
 * Framework-free on purpose. The HTTP layer is a thin adapter over this class,
 * so the behaviour that matters is testable without a server, a database or a
 * container. There is one instance per Cell, and it has no notion that other
 * Cells exist.
 */
export class LedgerService {
  readonly #store: LedgerStore
  readonly #cellId: string
  readonly #maxAppendAttempts: number

  constructor(store: LedgerStore, options: LedgerServiceOptions) {
    this.#store = store
    this.#cellId = options.cellId
    this.#maxAppendAttempts = options.maxAppendAttempts ?? 5
  }

  get cellId(): string {
    return this.#cellId
  }

  /**
   * Seal a set of entries into the chain.
   *
   * A block is built against the current head and then appended only if the
   * head has not moved. When it has, the block is rebuilt against the new head
   * and retried, because the entries themselves are still valid: only their
   * position changed.
   *
   * Validation failures are not retried. An unbalanced block will be unbalanced
   * on the next attempt too, so it throws immediately.
   */
  async record(entries: readonly Entry[], at?: string): Promise<Block> {
    let lastConflict: LedgerConflictError | null = null

    for (let attempt = 0; attempt < this.#maxAppendAttempts; attempt++) {
      const head = await this.#store.head()
      const block = appendBlock(head, entries, at)

      try {
        await this.#store.append(block, head?.seq ?? null)
        return block
      } catch (error) {
        if (!(error instanceof LedgerConflictError)) throw error
        lastConflict = error
      }
    }

    throw lastConflict ?? new Error('Append failed without a recorded conflict')
  }

  /**
   * Walk the chain from genesis and report the first break.
   *
   * Verification always starts at genesis, even when `upTo` limits how far it
   * runs. Verifying a slice out of the middle would prove only that the slice
   * is internally consistent, which is a weaker claim than it appears and is
   * exactly the kind of half-guarantee this platform exists to avoid.
   */
  async verify(options?: { upTo?: number }): Promise<VerifyResult> {
    const blocks = await this.#store.read(
      options?.upTo === undefined ? undefined : { to: options.upTo }
    )
    return verifyChain(blocks)
  }

  /** Verification plus the metadata that makes it evidence rather than a log line. */
  async evidence(options?: { upTo?: number }): Promise<IntegrityEvidence> {
    return {
      cellId: this.#cellId,
      verifiedAt: new Date().toISOString(),
      upTo: options?.upTo ?? null,
      result: await this.verify(options),
    }
  }

  /** The position of one account, replayed from genesis. */
  async balanceOf(account: string): Promise<bigint> {
    return balanceOf(await this.#store.read(), account)
  }

  /** Every account's position, in one walk. */
  async balances(): Promise<Map<string, bigint>> {
    return balances(await this.#store.read())
  }

  /**
   * Entries touching one account, newest first.
   *
   * This is the transaction history a customer sees. Each record carries the
   * sealing block's hash, which is what lets the interface show a ledger
   * confirmation status beside every line.
   */
  async history(account: string, limit?: number): Promise<LedgerRecord[]> {
    const blocks = await this.#store.read()
    const records: LedgerRecord[] = []

    for (let i = blocks.length - 1; i >= 0; i--) {
      const block = blocks[i]!
      for (const entry of block.entries) {
        if (entry.account !== account) continue
        records.push({
          seq: block.seq,
          at: block.at,
          hash: block.hash,
          entry,
          blockEntries: block.entries,
        })
        if (limit !== undefined && records.length >= limit) return records
      }
    }

    return records
  }

  /** The current head, or null on an empty chain. */
  async head(): Promise<Block | null> {
    return this.#store.head()
  }

  /** Number of blocks recorded. */
  async count(): Promise<number> {
    return this.#store.count()
  }
}
