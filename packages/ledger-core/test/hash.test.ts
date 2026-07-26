import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { canonicalise, hashBlock, isValidAccount, GENESIS_PREV_HASH } from '../src/hash.ts'
import { at, transfer, sampleChain } from './helpers.ts'

describe('canonical form', () => {
  test('is injective across the fields that matter', () => {
    // Two different records must never share a canonical form. If they could,
    // an attacker would be able to substitute one for the other and keep the
    // hash intact.
    const forms = new Set<string>([
      canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n)),
      canonicalise(1, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n)),
      canonicalise(0, 'f'.repeat(64), at(0), transfer('a', 'b', 100n)),
      canonicalise(0, GENESIS_PREV_HASH, at(1), transfer('a', 'b', 100n)),
      canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 101n)),
      canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('a', 'c', 100n)),
      canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('b', 'a', 100n)),
    ])
    assert.equal(forms.size, 7)
  })

  test('preserves entry order, because the order of record is part of the record', () => {
    const forward = canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n))
    const reversed = canonicalise(0, GENESIS_PREV_HASH, at(0), [
      ...transfer('a', 'b', 100n),
    ].reverse())
    assert.notEqual(forward, reversed)
  })

  test('serialises amounts as exact integers, never in exponential form', () => {
    const form = canonicalise(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 10_000_000_000_000_000_000_000n))
    assert.match(form, /10000000000000000000000/)
    assert.doesNotMatch(form, /e\+/i)
  })
})

describe('the encoding restricts nothing but emptiness', () => {
  test('accepts any non-empty identifier, including delimiters and non-ASCII', () => {
    for (const account of ['customer:alice', 'agent-west', 'a', 'a;b', 'a\nb', 'merchant:kadē']) {
      assert.equal(isValidAccount(account), true, JSON.stringify(account))
    }
  })

  test('rejects an empty identifier', () => {
    assert.equal(isValidAccount(''), false)
  })

  test('length prefixing keeps adjacent fields unambiguous', () => {
    // A delimited encoding would collapse these two records into the same
    // canonical form. Prefixing each field with its byte length keeps them
    // distinct, which is the property the hash chain depends on.
    const left = canonicalise(0, GENESIS_PREV_HASH, at(0), [
      { account: 'ab', direction: 'debit', amount: 1n },
      { account: 'c', direction: 'credit', amount: 1n },
    ])
    const right = canonicalise(0, GENESIS_PREV_HASH, at(0), [
      { account: 'a', direction: 'debit', amount: 1n },
      { account: 'bc', direction: 'credit', amount: 1n },
    ])
    assert.notEqual(left, right)
  })

  test('a multi-byte identifier is prefixed by its byte length, not its character count', () => {
    const form = canonicalise(0, GENESIS_PREV_HASH, at(0), [
      { account: 'kadē', direction: 'debit', amount: 1n },
      { account: 'b', direction: 'credit', amount: 1n },
    ])
    // "kadē" is four characters and five UTF-8 bytes.
    assert.match(form, /5:kadē/)
  })
})

describe('hashBlock', () => {
  test('produces lowercase hex of the expected width', () => {
    const hash = hashBlock(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n))
    assert.match(hash, /^[0-9a-f]{64}$/)
  })

  test('is stable across calls', () => {
    const args = [0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n)] as const
    assert.equal(hashBlock(...args), hashBlock(...args))
  })

  test('changes when any single field changes', () => {
    const base = hashBlock(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n))
    assert.notEqual(base, hashBlock(1, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n)))
    assert.notEqual(base, hashBlock(0, 'f'.repeat(64), at(0), transfer('a', 'b', 100n)))
    assert.notEqual(base, hashBlock(0, GENESIS_PREV_HASH, at(1), transfer('a', 'b', 100n)))
    assert.notEqual(base, hashBlock(0, GENESIS_PREV_HASH, at(0), transfer('a', 'b', 100n + 1n)))
  })

  test('every hash in a chain is distinct', () => {
    const hashes = new Set(sampleChain().map((b) => b.hash))
    assert.equal(hashes.size, 4)
  })
})

describe('genesis marker', () => {
  test('is sixty-four zeros, distinguishable from a dropped predecessor', () => {
    assert.equal(GENESIS_PREV_HASH, '0'.repeat(64))
    assert.match(GENESIS_PREV_HASH, /^[0-9a-f]{64}$/)
  })
})
