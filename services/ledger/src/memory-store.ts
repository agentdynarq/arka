import { LedgerConflictError } from './store.ts'
import type { LedgerStore } from './store.ts'
import type { Block } from './ledger-core.ts'

/**
 * An in-memory ledger store.
 *
 * Used by tests and by the seed script. It enforces the same append-only and
 * optimistic-concurrency rules as the Postgres adapter, so a test that passes
 * here is testing the service's real behaviour rather than a permissive stub.
 */
export class InMemoryLedgerStore implements LedgerStore {
  readonly #blocks: Block[] = []

  constructor(initial: readonly Block[] = []) {
    this.#blocks = [...initial]
  }

  async head(): Promise<Block | null> {
    return this.#blocks.at(-1) ?? null
  }

  async append(block: Block, expectedHeadSeq: number | null): Promise<void> {
    const actualHeadSeq = this.#blocks.at(-1)?.seq ?? null
    if (actualHeadSeq !== expectedHeadSeq) {
      throw new LedgerConflictError(expectedHeadSeq, actualHeadSeq)
    }
    this.#blocks.push(block)
  }

  async read(range?: { from?: number; to?: number }): Promise<Block[]> {
    const from = range?.from ?? 0
    const to = range?.to ?? Number.MAX_SAFE_INTEGER
    return this.#blocks.filter((b) => b.seq >= from && b.seq <= to)
  }

  async count(): Promise<number> {
    return this.#blocks.length
  }
}
