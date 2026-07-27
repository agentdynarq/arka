import type { RegistryEntry } from './types.ts'

/**
 * FR-01: the preserved registry, what survived the 2065 collapse in backup.
 * Re-verification checks a submitted `(customerId, registryDocumentId)` pair
 * against this store. There is no write path from re-verification itself,
 * only `seed`, used to populate the registry that was "preserved" before the
 * story starts.
 */
export interface RegistryStore {
  seed(entry: RegistryEntry): Promise<void>
  find(customerId: string, registryDocumentId: string): Promise<RegistryEntry | null>
}
