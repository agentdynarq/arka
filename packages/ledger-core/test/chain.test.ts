import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { appendBlock, verifyChain } from '../src/chain.ts'
import { GENESIS_PREV_HASH } from '../src/hash.ts'
import type { Block } from '../src/types.ts'
import { at, transfer, sampleChain, clone } from './helpers.ts'

describe('verifyChain: linkage', () => {
  test('a freshly built chain verifies clean', () => {
    const blocks = sampleChain()
    const result = verifyChain(blocks)

    assert.equal(result.ok, true)
    assert.equal(result.records, 4)
    assert.equal(result.rootHash, blocks[3]!.hash)
    assert.equal(result.brokenAt, undefined)
  })

  test('seq increments by exactly one', () => {
    const blocks = sampleChain()
    blocks.forEach((b, i) => assert.equal(b.seq, i))
  })

  test('each prevHash is the previous block hash', () => {
    const blocks = sampleChain()
    assert.equal(blocks[0]!.prevHash, GENESIS_PREV_HASH)
    for (let i = 1; i < blocks.length; i++) {
      assert.equal(blocks[i]!.prevHash, blocks[i - 1]!.hash)
    }
  })

  test('an empty chain is valid and has no root hash', () => {
    const result = verifyChain([])
    assert.equal(result.ok, true)
    assert.equal(result.records, 0)
    assert.equal(result.rootHash, null)
  })

  test('a single block chain verifies clean', () => {
    const blocks = [appendBlock(null, transfer('a', 'b', 100n), at(0))]
    assert.equal(verifyChain(blocks).ok, true)
  })
})

describe('verifyChain: structural breaks', () => {
  test('rejects a chain that does not start at genesis', () => {
    const blocks = sampleChain().slice(1)
    const result = verifyChain(blocks)

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 0)
  })

  test('detects a removed block at the index where the gap appears', () => {
    const blocks = sampleChain()
    const withGap = [blocks[0]!, blocks[1]!, blocks[3]!]
    const result = verifyChain(withGap)

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 2)
    assert.match(result.reason!, /seq/i)
  })

  test('detects a reordered pair', () => {
    const blocks = sampleChain()
    const swapped = [blocks[0]!, blocks[2]!, blocks[1]!, blocks[3]!]
    const result = verifyChain(swapped)

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 1)
  })

  test('detects a rewritten predecessor link', () => {
    const blocks = clone(sampleChain())
    blocks[2] = { ...blocks[2]!, prevHash: GENESIS_PREV_HASH }
    const result = verifyChain(blocks)

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 2)
    assert.match(result.reason!, /predecessor/i)
  })

  test('a break reports no root hash, so a tampered chain cannot present one', () => {
    const blocks = clone(sampleChain())
    blocks[1] = { ...blocks[1]!, hash: 'f'.repeat(64) }
    const result = verifyChain(blocks)

    assert.equal(result.ok, false)
    assert.equal(result.rootHash, null)
  })
})

describe('verifyChain: determinism', () => {
  test('the same entries and timestamps produce the same root hash', () => {
    const a = verifyChain(sampleChain())
    const b = verifyChain(sampleChain())
    assert.equal(a.rootHash, b.rootHash)
  })

  test('a different amount produces a different root hash', () => {
    const original = sampleChain()
    const altered = [
      transfer('bank:reserve', 'customer:alice', 500_01n),
      transfer('bank:reserve', 'customer:bob', 300_00n),
      transfer('customer:alice', 'customer:bob', 125_00n),
      transfer('customer:bob', 'merchant:kade', 50_00n),
    ]
    let prev: Block | null = null
    const rebuilt = altered.map((entries, i) => (prev = appendBlock(prev, entries, at(i))))

    assert.notEqual(verifyChain(rebuilt).rootHash, verifyChain(original).rootHash)
  })
})
