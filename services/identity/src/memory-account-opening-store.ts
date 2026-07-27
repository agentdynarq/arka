import type { AccountOpeningRecord } from './types.ts'
import type { AccountOpeningStore } from './account-opening-store.ts'

/** In-memory `AccountOpeningStore`, used by unit tests. */
export class InMemoryAccountOpeningStore implements AccountOpeningStore {
  readonly #records = new Map<string, AccountOpeningRecord>()

  async save(record: AccountOpeningRecord): Promise<void> {
    this.#records.set(record.customerId, record)
  }

  async get(customerId: string): Promise<AccountOpeningRecord | null> {
    return this.#records.get(customerId) ?? null
  }
}
