import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { LedgerService } from '../src/service.ts'
import { InMemoryLedgerStore } from '../src/memory-store.ts'
import { LedgerConflictError } from '../src/store.ts'
import type { LedgerStore } from '../src/store.ts'
import { LedgerError } from '../src/ledger-core.ts'
import type { Block, Entry } from '../src/ledger-core.ts'

function transfer(from: string, to: string, amount: bigint): Entry[] {
  return [
    { account: from, direction: 'debit', amount },
    { account: to, direction: 'credit', amount },
  ]
}

function serviceWith(store: LedgerStore = new InMemoryLedgerStore()): LedgerService {
  return new LedgerService(store, { cellId: 'cell-1' })
}

describe('record', () => {
  test('seals entries into a chain that verifies', async () => {
    const ledger = serviceWith()

    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))
    await ledger.record(transfer('customer:alice', 'customer:bob', 125_00n))

    const result = await ledger.verify()
    assert.equal(result.ok, true)
    assert.equal(result.records, 2)
  })

  test('links each block to the previous head', async () => {
    const ledger = serviceWith()

    const first = await ledger.record(transfer('a', 'b', 100n))
    const second = await ledger.record(transfer('b', 'c', 40n))

    assert.equal(second.seq, first.seq + 1)
    assert.equal(second.prevHash, first.hash)
  })

  test('rejects an unbalanced block without retrying', async () => {
    const store = new InMemoryLedgerStore()
    const ledger = new LedgerService(store, { cellId: 'cell-1' })

    await assert.rejects(
      () =>
        ledger.record([
          { account: 'a', direction: 'debit', amount: 100n },
          { account: 'b', direction: 'credit', amount: 1n },
        ]),
      (e: unknown) => e instanceof LedgerError && e.code === 'UNBALANCED_BLOCK'
    )

    assert.equal(await store.count(), 0, 'nothing should have been written')
  })
})

describe('optimistic concurrency', () => {
  test('a block built against a stale head is rejected by the store', async () => {
    const store = new InMemoryLedgerStore()
    const ledger = serviceWith(store)

    await ledger.record(transfer('a', 'b', 100n))
    const head = await store.head()

    // A writer that still believes the chain is empty must not win.
    await assert.rejects(
      () => store.append(head!, null),
      (e: unknown) => e instanceof LedgerConflictError
    )
    assert.equal(await store.count(), 1)
  })

  test('record rebuilds and retries when another writer wins the race', async () => {
    const store = new InMemoryLedgerStore()
    let interfered = false

    // A store that lets one concurrent write slip in between head() and
    // append(), which is exactly the race the sequence number guards.
    const racy: LedgerStore = {
      head: () => store.head(),
      read: (range) => store.read(range),
      count: () => store.count(),
      append: async (block, expectedHeadSeq) => {
        if (!interfered) {
          interfered = true
          const ledger = new LedgerService(store, { cellId: 'cell-1' })
          await ledger.record(transfer('intruder', 'elsewhere', 1n))
        }
        return store.append(block, expectedHeadSeq)
      },
    }

    const ledger = new LedgerService(racy, { cellId: 'cell-1' })
    const block = await ledger.record(transfer('a', 'b', 100n))

    assert.equal(interfered, true)
    assert.equal(block.seq, 1, 'the retried block should sit after the intruder')
    assert.equal((await ledger.verify()).ok, true)
    assert.equal(await store.count(), 2, 'both writes land, neither is lost')
  })

  test('gives up after the configured number of attempts', async () => {
    const store = new InMemoryLedgerStore()
    const alwaysConflicts: LedgerStore = {
      head: () => store.head(),
      read: (range) => store.read(range),
      count: () => store.count(),
      append: async () => {
        throw new LedgerConflictError(null, 99)
      },
    }

    const ledger = new LedgerService(alwaysConflicts, { cellId: 'cell-1', maxAppendAttempts: 3 })
    await assert.rejects(
      () => ledger.record(transfer('a', 'b', 100n)),
      (e: unknown) => e instanceof LedgerConflictError
    )
  })
})

describe('verify and evidence', () => {
  test('an empty ledger verifies clean with no root hash', async () => {
    const result = await serviceWith().verify()
    assert.equal(result.ok, true)
    assert.equal(result.records, 0)
    assert.equal(result.rootHash, null)
  })

  test('detects a record altered behind the service', async () => {
    const blocks: Block[] = []
    const store = new InMemoryLedgerStore()
    const ledger = serviceWith(store)

    await ledger.record(transfer('a', 'b', 100n))
    await ledger.record(transfer('b', 'c', 40n))
    blocks.push(...(await store.read()))

    // Someone with database access edits history directly.
    const tampered = blocks.map((b) => ({ ...b, entries: b.entries.map((e) => ({ ...e })) }))
    ;(tampered[0]!.entries[0] as { amount: bigint }).amount = 1n
    const compromised = serviceWith(new InMemoryLedgerStore(tampered))

    const result = await compromised.verify()
    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 0)
  })

  test('upTo limits how far verification runs but still starts at genesis', async () => {
    const ledger = serviceWith()
    for (let i = 0; i < 5; i++) await ledger.record(transfer('a', 'b', 10n))

    const partial = await ledger.verify({ upTo: 2 })
    assert.equal(partial.ok, true)
    assert.equal(partial.records, 3, 'blocks 0 through 2 inclusive')

    const full = await ledger.verify()
    assert.equal(full.records, 5)
  })

  test('evidence carries the cell, the time and the result', async () => {
    const ledger = serviceWith()
    await ledger.record(transfer('a', 'b', 100n))

    const evidence = await ledger.evidence()
    assert.equal(evidence.cellId, 'cell-1')
    assert.equal(evidence.result.ok, true)
    assert.equal(evidence.upTo, null)
    assert.match(evidence.verifiedAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  test('evidence survives a JSON round trip, so it can be exported', async () => {
    const ledger = serviceWith()
    await ledger.record(transfer('a', 'b', 100n))

    const evidence = await ledger.evidence()
    const exported = JSON.parse(JSON.stringify(evidence))

    assert.equal(exported.cellId, 'cell-1')
    assert.equal(exported.result.rootHash, evidence.result.rootHash)
  })
})

describe('balances and history', () => {
  test('balances replay from the stored chain', async () => {
    const ledger = serviceWith()
    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))
    await ledger.record(transfer('customer:alice', 'merchant:kade', 125_00n))

    assert.equal(await ledger.balanceOf('customer:alice'), 375_00n)
    assert.equal(await ledger.balanceOf('merchant:kade'), 125_00n)
    assert.equal(await ledger.balanceOf('customer:nobody'), 0n)
  })

  test('history returns entries touching an account, newest first', async () => {
    const ledger = serviceWith()
    await ledger.record(transfer('bank:reserve', 'customer:alice', 500_00n))
    await ledger.record(transfer('bank:reserve', 'customer:bob', 300_00n))
    await ledger.record(transfer('customer:alice', 'customer:bob', 125_00n))

    const history = await ledger.history('customer:alice')

    assert.equal(history.length, 2)
    assert.equal(history[0]!.seq, 2, 'newest first')
    assert.equal(history[0]!.entry.direction, 'debit')
    assert.equal(history[1]!.entry.direction, 'credit')
  })

  test('every history record carries the sealing block hash', async () => {
    const ledger = serviceWith()
    const block = await ledger.record(transfer('a', 'b', 100n))

    const history = await ledger.history('a')
    assert.equal(history[0]!.hash, block.hash)
  })

  test('blockEntries carries every entry in the sealing block, not only the match', async () => {
    const ledger = serviceWith()
    await ledger.record(transfer('customer:alice', 'customer:bob', 125_00n))

    const [record] = await ledger.history('customer:alice')

    assert.equal(record!.blockEntries.length, 2)
    const counterparty = record!.blockEntries.find((e) => e.account !== 'customer:alice')
    assert.equal(counterparty!.account, 'customer:bob')
  })

  test('history respects a limit', async () => {
    const ledger = serviceWith()
    for (let i = 0; i < 10; i++) await ledger.record(transfer('a', 'b', 10n))

    assert.equal((await ledger.history('a', 3)).length, 3)
  })
})
