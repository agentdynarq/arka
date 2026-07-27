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
 *   pnpm seed            seed any Cell that is currently empty
 *   pnpm seed --reset    drop and reseed every Cell, even if already seeded
 */
import { LedgerService, PgLedgerStore } from '../services/ledger/src/index.ts'
import type { Entry } from '../services/ledger/src/index.ts'
import { AccountsService, PgAccountRegistry } from '../services/accounts/src/index.ts'
import { loadEnvFile } from './lib/load-env.ts'
import { loadCellConfigs } from './lib/cell-config.ts'

loadEnvFile()

const reset = process.argv.includes('--reset')

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
}

/**
 * Only Cell 1 gets an agent float, matching what the wireframes actually
 * show demoed live: FR-16 (agent cash-in/cash-out, screen W4) walks through
 * `customer:alice`, which only exists in Cell 1. A no-cross-cell-reads
 * platform has no use for an agent account in a Cell nothing demos against.
 */
const AGENT_ACCOUNT_BY_CELL: Record<string, string> = {
  'cell-1': 'agent:west',
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

for (const config of loadCellConfigs()) {
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
    const customerIdOf = (accountId: string) => accountId.replace(/^(customer|agent):/, 'cust-')

    await accounts.open(first, customerIdOf(first), DISPLAY_NAMES[first] ?? first)
    await accounts.open(second, customerIdOf(second), DISPLAY_NAMES[second] ?? second)

    await ledger.record(opening(first, 1_000_00n))
    await ledger.record(opening(second, 1_000_00n))

    // A dozen small back-and-forth transfers, not one: FR-15's low-bandwidth
    // mode (screen W4) truncates history to the 10 newest lines, and that is
    // only demonstrable live if a seeded account actually has more than 10.
    for (let i = 0; i < 12; i++) {
      const [from, to] = i % 2 === 0 ? [first, second] : [second, first]
      await ledger.record(transfer(from, to, BigInt(5 + i) * 100n))
    }

    const agentAccount = AGENT_ACCOUNT_BY_CELL[config.cellId]
    if (agentAccount) {
      await accounts.open(agentAccount, customerIdOf(agentAccount), DISPLAY_NAMES[agentAccount] ?? agentAccount)
      await ledger.record(opening(agentAccount, 5_000_00n))
    }

    console.log(
      `${config.cellId}: seeded ${await ledger.count()} blocks (${first}, ${second}${agentAccount ? `, ${agentAccount}` : ''})`
    )
  } finally {
    await ledgerStore.close()
    await accountRegistry.close()
  }
}
