#!/usr/bin/env node
/**
 * Deterministic demo data for both Cells.
 *
 * Minimal for now, this is day-one-of-Phase-2 scope: enough for
 * `verify-ledger` to have something real to verify and for the accounts
 * service to have balances to read. It grows to match the wireframes exactly
 * on 30 July, per PHASE-2-PLAN.md; the shape here (named customers, an
 * opening deposit, a transfer between them) is the seed that grows, not
 * throwaway scaffolding.
 *
 * Usage:
 *   pnpm seed            seed any Cell that is currently empty
 *   pnpm seed --reset    drop and reseed every Cell, even if already seeded
 */
import { LedgerService, PgLedgerStore } from '../services/ledger/src/index.ts'
import type { Entry } from '../services/ledger/src/index.ts'
import { loadEnvFile } from './lib/load-env.ts'
import { loadCellConfigs } from './lib/cell-config.ts'

loadEnvFile()

const reset = process.argv.includes('--reset')

/** Cell 1 and Cell 2 get different customers, so a demo can show two real, distinct Cells. */
const CUSTOMERS_BY_CELL: Record<string, [string, string]> = {
  'cell-1': ['customer:alice', 'customer:bob'],
  'cell-2': ['customer:chandi', 'customer:deepal'],
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
  const store = new PgLedgerStore(config.connectionString)
  try {
    if (reset) {
      await store.resetSchema()
    }

    const ledger = new LedgerService(store, { cellId: config.cellId })
    const existing = await ledger.count()

    if (existing > 0) {
      console.log(`${config.cellId}: already seeded (${existing} blocks). Use --reset to rebuild.`)
      continue
    }

    const [first, second] = CUSTOMERS_BY_CELL[config.cellId] ?? ['customer:a', 'customer:b']
    await ledger.record(opening(first, 1_000_00n))
    await ledger.record(opening(second, 1_000_00n))
    await ledger.record(transfer(first, second, 125_00n))

    console.log(`${config.cellId}: seeded ${await ledger.count()} blocks (${first}, ${second})`)
  } finally {
    await store.close()
  }
}
