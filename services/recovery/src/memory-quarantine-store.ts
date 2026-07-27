import type { QuarantineDirection, QuarantineRow, QuarantineState } from './types.ts'
import type { QuarantineStore } from './quarantine-store.ts'

function emptyRow(cellId: string): QuarantineRow {
  return { cellId, state: 'none', direction: null, approvedBy: [], reason: null }
}

/** In-memory `QuarantineStore`, used by unit tests. */
export class InMemoryQuarantineStore implements QuarantineStore {
  readonly #rows = new Map<string, QuarantineRow>()

  async ensureRow(cellId: string): Promise<QuarantineRow> {
    let row = this.#rows.get(cellId)
    if (!row) {
      row = emptyRow(cellId)
      this.#rows.set(cellId, row)
    }
    return row
  }

  async get(cellId: string): Promise<QuarantineRow> {
    return this.#rows.get(cellId) ?? emptyRow(cellId)
  }

  /**
   * No `await` runs inside this method body, so it executes to completion in
   * one microtask turn: two concurrent callers cannot both observe the
   * precondition as satisfied for the same Cell. Same reasoning as
   * `InMemorySessionStore.claimRefreshToken` in `@arka/identity`.
   */
  async startPending(
    cellId: string,
    direction: QuarantineDirection,
    requestedBy: string,
    reason: string | null,
    expectedState: QuarantineState
  ): Promise<{ started: boolean; row: QuarantineRow }> {
    const current = this.#rows.get(cellId) ?? emptyRow(cellId)
    if (current.state !== expectedState) {
      return { started: false, row: current }
    }

    const updated: QuarantineRow = {
      cellId,
      state: 'pending_second_approval',
      direction,
      approvedBy: [requestedBy],
      reason,
    }
    this.#rows.set(cellId, updated)
    return { started: true, row: updated }
  }

  async addApprover(
    cellId: string,
    approvedBy: string,
    direction: QuarantineDirection
  ): Promise<{ added: boolean; row: QuarantineRow }> {
    const current = this.#rows.get(cellId) ?? emptyRow(cellId)

    if (current.state !== 'pending_second_approval' || current.direction !== direction) {
      return { added: false, row: current }
    }
    if (current.approvedBy.includes(approvedBy)) {
      return { added: false, row: current }
    }

    const approvedByNext = [...current.approvedBy, approvedBy]
    const finalised = approvedByNext.length >= 2

    // Quarantined keeps its two approvers on display (who quarantined it). A
    // completed lift resets to a clean slate: there is no active approval to
    // report once a Cell is back to normal.
    const updated: QuarantineRow = finalised
      ? {
          cellId,
          state: direction === 'quarantine' ? 'quarantined' : 'none',
          direction: null,
          approvedBy: direction === 'quarantine' ? approvedByNext : [],
          reason: null,
        }
      : { ...current, approvedBy: approvedByNext }

    this.#rows.set(cellId, updated)
    return { added: true, row: updated }
  }
}
