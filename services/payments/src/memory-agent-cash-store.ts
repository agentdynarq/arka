import type { AgentCashStore, AgentCashRow } from './agent-cash-store.ts'

/** In-memory `AgentCashStore`, used by unit tests. */
export class InMemoryAgentCashStore implements AgentCashStore {
  readonly #rows = new Map<string, AgentCashRow>()

  async create(row: Omit<AgentCashRow, 'consumedAt'>): Promise<void> {
    this.#rows.set(row.requestId, { ...row, consumedAt: null })
  }

  async get(requestId: string): Promise<AgentCashRow | null> {
    return this.#rows.get(requestId) ?? null
  }

  async consume(requestId: string): Promise<boolean> {
    // No `await` between the check and the write, so within one Node
    // process this is atomic for the same reason `InMemoryIdempotencyStore
    // .reserve` is: nothing else runs on the event loop between the two
    // statements.
    const existing = this.#rows.get(requestId)
    if (!existing || existing.consumedAt !== null) return false
    this.#rows.set(requestId, { ...existing, consumedAt: new Date().toISOString() })
    return true
  }
}
