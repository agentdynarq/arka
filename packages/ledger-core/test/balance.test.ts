import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { balanceOf, balances, totalPosition } from '../src/balance.ts'
import { appendBlock } from '../src/chain.ts'
import type { Block } from '../src/types.ts'
import { at, transfer, sampleChain, chainOf } from './helpers.ts'

describe('balanceOf', () => {
  test('credits increase and debits decrease a position', () => {
    const blocks = sampleChain()

    // alice received 500.00 and sent 125.00
    assert.equal(balanceOf(blocks, 'customer:alice'), 375_00n)
    // bob received 300.00 and 125.00, then sent 50.00
    assert.equal(balanceOf(blocks, 'customer:bob'), 375_00n)
    assert.equal(balanceOf(blocks, 'merchant:kade'), 50_00n)
    // the reserve funded both openings
    assert.equal(balanceOf(blocks, 'bank:reserve'), -800_00n)
  })

  test('an unknown account has a zero position rather than throwing', () => {
    assert.equal(balanceOf(sampleChain(), 'customer:nobody'), 0n)
  })

  test('an empty chain gives every account a zero position', () => {
    assert.equal(balanceOf([], 'customer:alice'), 0n)
  })

  test('stays exact past the range a float could represent', () => {
    const huge = 9_007_199_254_740_993n
    const blocks = chainOf([transfer('a', 'b', huge), transfer('a', 'b', 1n)])
    assert.equal(balanceOf(blocks, 'b'), huge + 1n)
  })
})

describe('replay equals the projection', () => {
  /**
   * The concrete meaning of "everything else is a rebuildable projection of the
   * ledger". A projection maintained incrementally as blocks arrive must equal
   * one replayed from genesis. If these ever disagree, the projection is wrong
   * and the ledger is right.
   */
  test('an incrementally maintained projection matches a full replay', () => {
    const movements = [
      transfer('bank:reserve', 'customer:alice', 1_000_00n),
      transfer('customer:alice', 'merchant:kade', 249_99n),
      transfer('bank:reserve', 'customer:bob', 500_00n),
      transfer('customer:bob', 'customer:alice', 75_50n),
      transfer('customer:alice', 'agent:west', 12_25n),
    ]

    const projection = new Map<string, bigint>()
    const blocks: Block[] = []
    let prev: Block | null = null

    movements.forEach((entries, i) => {
      prev = appendBlock(prev, entries, at(i))
      blocks.push(prev)
      // The projection only ever sees the newest block, exactly as a read model
      // consuming the event stream would.
      for (const e of prev.entries) {
        const current = projection.get(e.account) ?? 0n
        projection.set(e.account, current + (e.direction === 'credit' ? e.amount : -e.amount))
      }
    })

    const replayed = balances(blocks)
    assert.deepEqual(
      [...replayed.entries()].sort(),
      [...projection.entries()].sort(),
      'a projection built incrementally must equal one replayed from genesis'
    )
  })

  test('balances agrees with balanceOf for every account', () => {
    const blocks = sampleChain()
    for (const [account, value] of balances(blocks)) {
      assert.equal(value, balanceOf(blocks, account), `mismatch on ${account}`)
    }
  })

  test('replaying a prefix of the chain gives the position at that point in time', () => {
    const blocks = sampleChain()
    // After two blocks alice has been funded but has not yet sent anything.
    assert.equal(balanceOf(blocks.slice(0, 2), 'customer:alice'), 500_00n)
    assert.equal(balanceOf(blocks, 'customer:alice'), 375_00n)
  })
})

describe('the whole ledger balances', () => {
  test('every position sums to zero', () => {
    assert.equal(totalPosition(sampleChain()), 0n)
  })

  test('still sums to zero after many blocks', () => {
    const movements = Array.from({ length: 200 }, (_, i) =>
      transfer(`account:${i % 7}`, `account:${(i + 3) % 7}`, BigInt(i + 1))
    )
    assert.equal(totalPosition(chainOf(movements)), 0n)
  })

  test('an empty chain sums to zero', () => {
    assert.equal(totalPosition([]), 0n)
  })
})
