import { AccountsError } from './types.ts'
import type { Account } from './types.ts'
import type { AccountRegistry } from './registry.ts'

/** In-memory `AccountRegistry`, used by unit tests. */
export class InMemoryAccountRegistry implements AccountRegistry {
  readonly #accounts = new Map<string, Account>()

  async open(account: Account): Promise<void> {
    if (this.#accounts.has(account.accountId)) {
      throw new AccountsError('ACCOUNT_ALREADY_EXISTS', `Account "${account.accountId}" already exists`)
    }
    this.#accounts.set(account.accountId, account)
  }

  async get(accountId: string): Promise<Account | null> {
    return this.#accounts.get(accountId) ?? null
  }

  async listByCustomer(customerId: string): Promise<Account[]> {
    return [...this.#accounts.values()].filter((a) => a.customerId === customerId)
  }
}
