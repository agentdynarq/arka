import { AccountsError } from './types.ts'
import type { Account, AccountSummary, TransactionHistoryEntry } from './types.ts'
import type { AccountRegistry } from './registry.ts'
import type { LedgerService } from '@arka/ledger'
import type { LedgerRecord } from '@arka/ledger'

export interface AccountsServiceOptions {
  readonly registry: AccountRegistry
  readonly ledger: LedgerService
}

/**
 * Accounts for one Cell. Framework-free, same reasoning as `LedgerService`:
 * the behaviour that decides what a customer is shown should be testable
 * without a server or a database.
 *
 * Never touches the ledger's storage directly. Every number here comes from
 * calling `LedgerService`'s public methods, the same boundary any other
 * consumer of the ledger would cross.
 */
export class AccountsService {
  readonly #registry: AccountRegistry
  readonly #ledger: LedgerService

  constructor(options: AccountsServiceOptions) {
    this.#registry = options.registry
    this.#ledger = options.ledger
  }

  /** FR-02 provisions the registry row; this is the account's side of that, not Identity's KYC flow. */
  async open(accountId: string, customerId: string, displayName: string): Promise<Account> {
    if (displayName.trim().length === 0) {
      throw new AccountsError('INVALID_DISPLAY_NAME', 'displayName must not be empty')
    }

    const account: Account = { accountId, customerId, displayName, openedAt: new Date().toISOString() }
    await this.#registry.open(account)
    return account
  }

  /** FR-06: the balance a customer sees, sourced from the ledger, never cached. */
  async summary(accountId: string): Promise<AccountSummary> {
    const account = await this.#requireAccount(accountId)
    const balance = await this.#ledger.balanceOf(accountId)
    return {
      accountId: account.accountId,
      customerId: account.customerId,
      displayName: account.displayName,
      balance,
    }
  }

  /** Every account belonging to one customer, each with its current balance. */
  async summariesForCustomer(customerId: string): Promise<AccountSummary[]> {
    const accounts = await this.#registry.listByCustomer(customerId)
    return Promise.all(
      accounts.map(async (account) => ({
        accountId: account.accountId,
        customerId: account.customerId,
        displayName: account.displayName,
        balance: await this.#ledger.balanceOf(account.accountId),
      }))
    )
  }

  /** FR-06 and FR-08: transaction history, each line carrying its ledger confirmation status. */
  async history(accountId: string, limit?: number): Promise<TransactionHistoryEntry[]> {
    await this.#requireAccount(accountId)
    const records = await this.#ledger.history(accountId, limit)
    return records.map((record) => toHistoryEntry(accountId, record))
  }

  async #requireAccount(accountId: string): Promise<Account> {
    const account = await this.#registry.get(accountId)
    if (account === null) {
      throw new AccountsError('ACCOUNT_NOT_FOUND', `No account "${accountId}"`)
    }
    return account
  }
}

/**
 * A block balances, so a two-party transfer's other side is always present
 * in `blockEntries`. When more than one other account appears in the same
 * block, there is no single counterparty to name, so the hint says so rather
 * than guessing which one to show.
 */
function toHistoryEntry(accountId: string, record: LedgerRecord): TransactionHistoryEntry {
  const others = record.blockEntries.filter((e) => e.account !== accountId)
  const distinctOthers = new Set(others.map((e) => e.account))
  const counterpartyHint =
    distinctOthers.size === 1 ? [...distinctOthers][0]! : distinctOthers.size === 0 ? accountId : '(multiple parties)'

  return {
    seq: record.seq,
    at: record.at,
    direction: record.entry.direction,
    amount: record.entry.amount,
    counterpartyHint,
    ledgerBlockHash: record.hash,
    confirmed: true,
  }
}
