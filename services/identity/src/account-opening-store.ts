import type { AccountOpeningRecord } from './types.ts'

/** FR-02: one row per account-opening application, keyed by the newly minted customer id. */
export interface AccountOpeningStore {
  save(record: AccountOpeningRecord): Promise<void>
  get(customerId: string): Promise<AccountOpeningRecord | null>
}
