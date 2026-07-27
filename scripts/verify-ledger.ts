#!/usr/bin/env node
/**
 * Walk one or every Cell's ledger from genesis and report the result.
 *
 * Usage:
 *   pnpm verify-ledger              verify every configured Cell
 *   pnpm verify-ledger --cell cell-1
 *
 * This is the command line form of docs/RUNBOOK.md, P1. It exists as a script
 * rather than only a Recovery Console screen so an operator, or a judge, can
 * run it with nothing but a terminal, and so the console and the CLI can be
 * cross-checked against each other if either is ever suspected of lying.
 *
 * Exits non-zero if any verified Cell's chain is broken, so it composes with
 * CI or a cron job without extra parsing.
 */
import { LedgerService, PgLedgerStore } from '../services/ledger/src/index.ts'
import type { IntegrityEvidence } from '../services/ledger/src/index.ts'
import { loadEnvFile } from './lib/load-env.ts'
import { loadCellConfigs } from './lib/cell-config.ts'

loadEnvFile()

const requestedCell = readCellArg(process.argv.slice(2))
const configs = loadCellConfigs().filter((c) => !requestedCell || c.cellId === requestedCell)

if (configs.length === 0) {
  console.error(`No configured Cell matches "${requestedCell}". Configured: cell-1, cell-2.`)
  process.exit(1)
}

let anyBroken = false

for (const config of configs) {
  const store = new PgLedgerStore(config.connectionString)
  try {
    const ledger = new LedgerService(store, { cellId: config.cellId })
    const evidence = await ledger.evidence()
    report(config.cellId, evidence)
    if (!evidence.result.ok) anyBroken = true
  } finally {
    await store.close()
  }
}

process.exit(anyBroken ? 1 : 0)

function report(cellId: string, evidence: IntegrityEvidence): void {
  console.log(`\nCell ${cellId}`)
  console.log(`  records:     ${evidence.result.records}`)
  console.log(`  root hash:   ${evidence.result.rootHash ?? '(empty chain)'}`)
  console.log(`  verified at: ${evidence.verifiedAt}`)
  if (evidence.result.ok) {
    console.log(`  status:      clean`)
  } else {
    console.log(`  status:      BROKEN at block ${evidence.result.brokenAt}`)
    console.log(`  reason:      ${evidence.result.reason}`)
  }
}

function readCellArg(args: readonly string[]): string | undefined {
  const idx = args.indexOf('--cell')
  return idx === -1 ? undefined : args[idx + 1]
}
