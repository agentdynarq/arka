import type { Account } from './types.ts'

/**
 * Where account metadata lives: the mapping from account id to the customer
 * who owns it and its display name.
 *
 * This is deliberately separate from the ledger. The ledger knows nothing
 * about customers, only account strings and amounts; `AccountRegistry` is
 * this service's own schema, per "one schema per service" in
 * docs/ARCHITECTURE.md. Accounts never reads the ledger's tables directly, it
 * calls `@arka/ledger`'s public methods, same as any other consumer would.
 */
export interface AccountRegistry {
  open(account: Account): Promise<void>
  get(accountId: string): Promise<Account | null>
  listByCustomer(customerId: string): Promise<Account[]>
}
