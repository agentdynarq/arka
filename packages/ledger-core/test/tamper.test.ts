import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { verifyChain } from '../src/chain.ts'
import { hashBlock } from '../src/hash.ts'
import { sampleChain, clone } from './helpers.ts'

/**
 * The claim this package exists to back: altering a historical record is
 * detected, and the break is located rather than merely reported.
 *
 * Each case tampers at every position in the chain, not only a convenient one,
 * because a detector that only catches edits to the last block would pass a
 * looser test while being useless.
 */
describe('tamper detection locates the altered block', () => {
  const length = sampleChain().length

  for (let i = 0; i < length; i++) {
    test(`an altered amount in block ${i} is caught at index ${i}`, () => {
      const blocks = clone(sampleChain())
      const entry = blocks[i]!.entries[0]!
      ;(entry as { amount: bigint }).amount = entry.amount + 1n

      const result = verifyChain(blocks)
      assert.equal(result.ok, false)
      assert.equal(result.brokenAt, i)
    })

    test(`a redirected account in block ${i} is caught at index ${i}`, () => {
      const blocks = clone(sampleChain())
      const entry = blocks[i]!.entries[1]!
      ;(entry as { account: string }).account = 'attacker:wallet'

      const result = verifyChain(blocks)
      assert.equal(result.ok, false)
      assert.equal(result.brokenAt, i)
    })

    test(`a flipped direction in block ${i} is caught at index ${i}`, () => {
      const blocks = clone(sampleChain())
      const entries = blocks[i]!.entries
      ;(entries[0] as { direction: string }).direction = 'credit'
      ;(entries[1] as { direction: string }).direction = 'debit'

      const result = verifyChain(blocks)
      assert.equal(result.ok, false)
      assert.equal(result.brokenAt, i)
    })

    test(`a backdated timestamp in block ${i} is caught at index ${i}`, () => {
      const blocks = clone(sampleChain())
      blocks[i] = { ...blocks[i]!, at: '2065-01-01T00:00:00.000Z' }

      const result = verifyChain(blocks)
      assert.equal(result.ok, false)
      assert.equal(result.brokenAt, i)
    })
  }
})

describe('tamper detection resists a partial cover-up', () => {
  test('repairing the altered block hash only moves the break one step later', () => {
    // The realistic attack. Someone with write access alters block 1, keeps it
    // balanced, and recomputes its hash so the block is internally consistent.
    // Block 2 still records the original predecessor hash, so the chain breaks
    // at 2 instead of 1. Covering the whole chain means rewriting every block
    // after the edit, which is what the published root hash makes futile.
    const blocks = clone(sampleChain())
    const entries = blocks[1]!.entries.map((e) => ({ ...e, amount: 1n }))
    blocks[1] = {
      ...blocks[1]!,
      entries,
      hash: hashBlock(blocks[1]!.seq, blocks[1]!.prevHash, blocks[1]!.at, entries),
    }

    assert.equal(verifyChain([blocks[0]!, blocks[1]!]).ok, true, 'the edited block alone looks sound')

    const result = verifyChain(blocks)
    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 2)
    assert.match(result.reason!, /predecessor/i)
  })

  test('deleting the final block leaves a chain that verifies but has a new root', () => {
    // Truncation is the one edit a hash chain alone cannot detect, which is why
    // the root hash is published at checkpoints. Recording that honestly here
    // is better than pretending the primitive covers it.
    const full = sampleChain()
    const truncated = full.slice(0, -1)

    const result = verifyChain(truncated)
    assert.equal(result.ok, true)
    assert.notEqual(result.rootHash, verifyChain(full).rootHash)
  })

  test('an unbalanced block is rejected even if its hash is consistent', () => {
    const blocks = clone(sampleChain())
    const entries = blocks[2]!.entries
    ;(entries[0] as { amount: bigint }).amount = 1n

    const result = verifyChain(blocks)
    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 2)
  })
})
