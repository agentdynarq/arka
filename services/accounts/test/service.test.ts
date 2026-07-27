import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { LedgerService, InMemoryLedgerStore } from '@arka/ledger'
import type { Entry } from '@arka/ledger'

import { AccountsService } from '../src/service.ts'
import { InMemoryAccountRegistry } from '../src/memory-registry.ts'
import { AccountsError } from '../src/types.ts'

function transfer(from: string, to: string, amount: bigint): Entry[] {
  return [
    { account: from, direction: 'debit', amount },
    { account: to, direction: 'credit', amount },
  ]
}

function newAccounts(): { accounts: AccountsService; ledger: LedgerService } {
  const ledger = new LedgerService(new InMemoryLedgerStore(), { cellId: 'cell-1' })
  const accounts = new AccountsService({ registry: new InMemoryAccountRegistry(), ledger })
  return { accounts, ledger }
}

describe('open', () => {
  test('opens an account with a zero balance', async () => {
    const { accounts } = newAccounts()
    const account = await accounts.open('customer:alice', 'cust-1', 'Alice Perera')

    assert.equal(account.accountId, 'customer:alice')
    assert.equal((await accounts.summary('customer:alice')).balance, 0n)
  })

  test('rejects opening the same account id twice', async () => {
    const { accounts } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')

    await assert.rejects(
      () => accounts.open('customer:alice', 'cust-1', 'Alice Perera'),
      (e: unknown) => e instanceof AccountsError && e.code === 'ACCOUNT_ALREADY_EXISTS'
    )
  })

  test('rejects an empty display name', async () => {
    const { accounts } = newAccounts()
    await assert.rejects(
      () => accounts.open('customer:alice', 'cust-1', '   '),
      (e: unknown) => e instanceof AccountsError && e.code === 'INVALID_DISPLAY_NAME'
    )
  })
})

describe('summary', () => {
  test('reflects the ledger balance, never a cached figure', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')

    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))
    assert.equal((await accounts.summary('customer:alice')).balance, 500_00n)

    await ledger.record(transfer('customer:alice', 'merchant:kade', 125_00n))
    assert.equal((await accounts.summary('customer:alice')).balance, 375_00n)
  })

  test('throws for an account that was never opened', async () => {
    const { accounts } = newAccounts()
    await assert.rejects(
      () => accounts.summary('customer:nobody'),
      (e: unknown) => e instanceof AccountsError && e.code === 'ACCOUNT_NOT_FOUND'
    )
  })
})

describe('summariesForCustomer', () => {
  test('lists every account belonging to one customer, each with its own balance', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice:main', 'cust-1', 'Alice Perera, main')
    await accounts.open('customer:alice:savings', 'cust-1', 'Alice Perera, savings')
    await accounts.open('customer:bob:main', 'cust-2', 'Bob Silva')

    await ledger.record(transfer('bank:reserve', 'customer:alice:main', 200_00n))
    await ledger.record(transfer('bank:reserve', 'customer:alice:savings', 900_00n))
    await ledger.record(transfer('bank:reserve', 'customer:bob:main', 50_00n))

    const summaries = await accounts.summariesForCustomer('cust-1')

    assert.equal(summaries.length, 2)
    assert.ok(summaries.every((s) => s.customerId === 'cust-1'))
    const total = summaries.reduce((sum, s) => sum + s.balance, 0n)
    assert.equal(total, 1_100_00n)
  })

  test('an unknown customer has no accounts, not an error', async () => {
    const { accounts } = newAccounts()
    assert.deepEqual(await accounts.summariesForCustomer('cust-nobody'), [])
  })
})

describe('history', () => {
  test('carries the ledger confirmation status on every line', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')
    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))

    const history = await accounts.history('customer:alice')
    assert.equal(history[0]!.confirmed, true)
    assert.equal(history[0]!.ledgerBlockHash.length, 64)
  })

  test('names the counterparty of a two-party transfer', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')
    await accounts.open('customer:bob', 'cust-2', 'Bob Silva')

    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))
    await ledger.record(transfer('customer:alice', 'customer:bob', 125_00n))

    const history = await accounts.history('customer:alice')
    const outgoing = history.find((h) => h.direction === 'debit')
    assert.equal(outgoing!.counterpartyHint, 'customer:bob')
  })

  test('falls back rather than guessing when a block touches more than one other account', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')

    await ledger.record([
      { account: 'customer:alice', direction: 'debit', amount: 30n },
      { account: 'merchant:a', direction: 'credit', amount: 10n },
      { account: 'merchant:b', direction: 'credit', amount: 20n },
    ])

    const history = await accounts.history('customer:alice')
    assert.equal(history[0]!.counterpartyHint, '(multiple parties)')
  })

  test('newest first, and respects a limit', async () => {
    const { accounts, ledger } = newAccounts()
    await accounts.open('customer:alice', 'cust-1', 'Alice Perera')
    for (let i = 0; i < 5; i++) {
      await ledger.record(transfer('bank:reserve', 'customer:alice', 10n))
    }

    const history = await accounts.history('customer:alice', 2)
    assert.equal(history.length, 2)
    assert.ok(history[0]!.seq > history[1]!.seq)
  })

  test('throws for an account that was never opened', async () => {
    const { accounts } = newAccounts()
    await assert.rejects(
      () => accounts.history('customer:nobody'),
      (e: unknown) => e instanceof AccountsError && e.code === 'ACCOUNT_NOT_FOUND'
    )
  })
})
