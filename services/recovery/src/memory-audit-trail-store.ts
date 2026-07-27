import { AuditTrailConflictError } from './audit-trail-store.ts'
import type { AuditTrailStore } from './audit-trail-store.ts'
import type { AuditRecord } from './audit-hash.ts'

/** In-memory `AuditTrailStore`, used by unit tests. */
export class InMemoryAuditTrailStore implements AuditTrailStore {
  readonly #records: AuditRecord[] = []

  async head(): Promise<AuditRecord | null> {
    return this.#records[this.#records.length - 1] ?? null
  }

  async append(record: AuditRecord, expectedHeadSeq: number | null): Promise<void> {
    const actualHead = await this.head()
    if ((actualHead?.seq ?? null) !== expectedHeadSeq) {
      throw new AuditTrailConflictError(expectedHeadSeq, actualHead?.seq ?? null)
    }
    this.#records.push(record)
  }

  async read(): Promise<AuditRecord[]> {
    return [...this.#records]
  }
}
