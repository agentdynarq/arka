#!/usr/bin/env node
/**
 * Deterministic demo data for both Cells.
 *
 * Minimal for now, this is day-one-of-Phase-2 scope: enough for
 * `verify-ledger` to have something real to verify and for Accounts to have
 * registered accounts with balances to read. It grows to match the
 * wireframes exactly on 30 July, per PHASE-2-PLAN.md; the shape here (named
 * customers, an opening deposit, a transfer between them) is the seed that
 * grows, not throwaway scaffolding.
 *
 * Usage:
 *   pnpm seed                    seed any Cell that is currently empty
 *   pnpm seed --reset            drop and reseed every Cell, even if already seeded
 *   pnpm seed --reset --cell cell-1   same, limited to one Cell
 */
import { LedgerService, PgLedgerStore } from '../services/ledger/src/index.ts'
import type { Entry } from '../services/ledger/src/index.ts'
import { AccountsService, PgAccountRegistry } from '../services/accounts/src/index.ts'
import { loadEnvFile } from './lib/load-env.ts'
import { loadCellConfigs } from './lib/cell-config.ts'

loadEnvFile()

const reset = process.argv.includes('--reset')
const requestedCell = readCellArg(process.argv.slice(2))

function readCellArg(args: readonly string[]): string | undefined {
  const idx = args.indexOf('--cell')
  return idx === -1 ? undefined : args[idx + 1]
}

/** Cell 1 and Cell 2 get different customers, so a demo can show two real, distinct Cells. */
const CUSTOMERS_BY_CELL: Record<string, [string, string]> = {
  'cell-1': ['customer:alice', 'customer:bob'],
  'cell-2': ['customer:chandi', 'customer:deepal'],
}

const DISPLAY_NAMES: Record<string, string> = {
  'customer:alice': 'Alice Perera',
  'customer:bob': 'Bob Silva',
  'customer:chandi': 'Chandi Fernando',
  'customer:deepal': 'Deepal Jayasuriya',
  'agent:west': 'Agent, West Region',
  'merchant:kade': 'Kade Stores',
}

/**
 * Only Cell 1 gets an agent float and a merchant account, matching what the
 * wireframes actually show demoed live: FR-16 (agent cash-in/cash-out) and
 * FR-11 (QR acceptance, both screen W4) walk through `customer:alice`,
 * which only exists in Cell 1. A no-cross-cell-reads platform has no use
 * for either in a Cell nothing demos against.
 */
const AGENT_ACCOUNT_BY_CELL: Record<string, string> = {
  'cell-1': 'agent:west',
}

const MERCHANT_ACCOUNT_BY_CELL: Record<string, string> = {
  'cell-1': 'merchant:kade',
}

function opening(account: string, amount: bigint): Entry[] {
  return [
    { account: 'bank:reserve', direction: 'debit', amount },
    { account, direction: 'credit', amount },
  ]
}

function transfer(from: string, to: string, amount: bigint): Entry[] {
  return [
    { account: from, direction: 'debit', amount },
    { account: to, direction: 'credit', amount },
  ]
}

/** ISO 8601 UTC, millisecond precision, N days back from seed time at a given hour and minute. */
function isoAt(daysAgo: number, hour: number, minute: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - daysAgo)
  d.setUTCHours(hour, minute, 0, 0)
  return d.toISOString()
}

interface AliceTxn {
  readonly daysAgo: number
  readonly hour: number
  readonly minute: number
  /** Relative to alice. */
  readonly direction: 'in' | 'out'
  readonly counterparty: 'bob' | string
  readonly amount: bigint
}

/**
 * Nine days of alice's ordinary banking, replacing a dozen identical
 * micro-transfers with bob (same two accounts, same second, 5.00-16.00 LKR)
 * that made every dashboard screenshot read as fixture data rather than a
 * bank. Amounts, order and running balance are worked out by hand so the
 * balance never dips negative and lands somewhere a real checking account
 * would: opens at 30,000.00, ends at 51,100.00. `counterparty: 'bob'` routes
 * through the real seeded `customer:bob` account so his side stays coherent
 * too; everything else is an unopened external account, which the ledger
 * allows since a counterparty only needs a name, not a registered customer.
 */
const ALICE_TRANSACTIONS: readonly AliceTxn[] = [
  { daysAgo: 9, hour: 4, minute: 12, direction: 'in', counterparty: 'employer:lanka-systems', amount: 48_500_00n },
  { daysAgo: 8, hour: 6, minute: 40, direction: 'out', counterparty: 'atm:colombo-07', amount: 10_000_00n },
  { daysAgo: 7, hour: 5, minute: 5, direction: 'out', counterparty: 'merchant:keells-super', amount: 4_250_00n },
  { daysAgo: 6, hour: 9, minute: 22, direction: 'out', counterparty: 'biller:ceb-electricity', amount: 3_800_00n },
  { daysAgo: 5, hour: 7, minute: 50, direction: 'out', counterparty: 'biller:dialog-axiata', amount: 2_500_00n },
  { daysAgo: 4, hour: 4, minute: 15, direction: 'out', counterparty: 'bob', amount: 5_000_00n },
  { daysAgo: 4, hour: 9, minute: 30, direction: 'in', counterparty: 'bob', amount: 2_000_00n },
  { daysAgo: 3, hour: 6, minute: 5, direction: 'out', counterparty: 'merchant:cargills-food-city', amount: 1_750_00n },
  { daysAgo: 2, hour: 8, minute: 45, direction: 'out', counterparty: 'atm:colombo-03', amount: 6_000_00n },
  { daysAgo: 1, hour: 4, minute: 20, direction: 'out', counterparty: 'merchant:pickme', amount: 350_00n },
  { daysAgo: 1, hour: 10, minute: 5, direction: 'in', counterparty: 'bob', amount: 3_500_00n },
  { daysAgo: 0, hour: 5, minute: 0, direction: 'in', counterparty: 'merchant:keells-super', amount: 750_00n },
]

const ALICE_OPENING = 30_000_00n
const BOB_OPENING = 30_000_00n

const cellConfigs = loadCellConfigs().filter((c) => !requestedCell || c.cellId === requestedCell)

for (const config of cellConfigs) {
  const ledgerStore = new PgLedgerStore(config.connectionString)
  const accountRegistry = new PgAccountRegistry(config.connectionString)

  try {
    if (reset) {
      await ledgerStore.resetSchema()
      await accountRegistry.resetSchema()
    }

    const ledger = new LedgerService(ledgerStore, { cellId: config.cellId })
    const accounts = new AccountsService({ registry: accountRegistry, ledger })
    const existing = await ledger.count()

    if (existing > 0) {
      console.log(`${config.cellId}: already seeded (${existing} blocks). Use --reset to rebuild.`)
      continue
    }

    const [first, second] = CUSTOMERS_BY_CELL[config.cellId] ?? ['customer:a', 'customer:b']
    const customerIdOf = (accountId: string) => accountId.replace(/^(customer|agent|merchant):/, 'cust-')

    await accounts.open(first, customerIdOf(first), DISPLAY_NAMES[first] ?? first)
    await accounts.open(second, customerIdOf(second), DISPLAY_NAMES[second] ?? second)

    if (config.cellId === 'cell-1') {
      await ledger.record(opening(first, ALICE_OPENING))
      await ledger.record(opening(second, BOB_OPENING))

      for (const txn of ALICE_TRANSACTIONS) {
        const at = isoAt(txn.daysAgo, txn.hour, txn.minute)
        const counterparty = txn.counterparty === 'bob' ? second : txn.counterparty
        const entries = txn.direction === 'out' ? transfer(first, counterparty, txn.amount) : transfer(counterparty, first, txn.amount)
        await ledger.record(entries, at)
      }
    } else {
      await ledger.record(opening(first, 1_000_00n))
      await ledger.record(opening(second, 1_000_00n))

      // A dozen small back-and-forth transfers, not one: FR-15's low-bandwidth
      // mode (screen W4) truncates history to the 10 newest lines, and that is
      // only demonstrable live if a seeded account actually has more than 10.
      for (let i = 0; i < 12; i++) {
        const [from, to] = i % 2 === 0 ? [first, second] : [second, first]
        await ledger.record(transfer(from, to, BigInt(5 + i) * 100n))
      }
    }

    const agentAccount = AGENT_ACCOUNT_BY_CELL[config.cellId]
    if (agentAccount) {
      await accounts.open(agentAccount, customerIdOf(agentAccount), DISPLAY_NAMES[agentAccount] ?? agentAccount)
      await ledger.record(opening(agentAccount, 5_000_00n))
    }

    const merchantAccount = MERCHANT_ACCOUNT_BY_CELL[config.cellId]
    if (merchantAccount) {
      // No opening deposit: a merchant's balance should read zero until a
      // real QR redemption credits it, so the FR-11 demo shows a genuine
      // before/after rather than an already-inflated number.
      await accounts.open(merchantAccount, customerIdOf(merchantAccount), DISPLAY_NAMES[merchantAccount] ?? merchantAccount)
    }

    const extras = [agentAccount, merchantAccount].filter(Boolean)
    console.log(`${config.cellId}: seeded ${await ledger.count()} blocks (${first}, ${second}${extras.length ? `, ${extras.join(', ')}` : ''})`)
  } finally {
    await ledgerStore.close()
    await accountRegistry.close()
  }
}
