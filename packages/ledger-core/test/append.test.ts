import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { appendBlock } from '../src/chain.ts'
import { GENESIS_PREV_HASH } from '../src/hash.ts'
import { LedgerError } from '../src/types.ts'
import type { Entry } from '../src/types.ts'
import { at, transfer } from './helpers.ts'

describe('appendBlock: every block balances', () => {
  test('accepts a balanced block', () => {
    const block = appendBlock(null, transfer('a', 'b', 100n), at(0))
    assert.equal(block.entries.length, 2)
  })

  test('rejects a block whose debits and credits differ', () => {
    assert.throws(
      () =>
        appendBlock(
          null,
          [
            { account: 'a', direction: 'debit', amount: 100n },
            { account: 'b', direction: 'credit', amount: 99n },
          ],
          at(0)
        ),
      (e: unknown) => e instanceof LedgerError && e.code === 'UNBALANCED_BLOCK'
    )
  })

  test('rejects a one-sided block', () => {
    assert.throws(
      () => appendBlock(null, [{ account: 'a', direction: 'debit', amount: 100n }], at(0)),
      (e: unknown) => e instanceof LedgerError && e.code === 'UNBALANCED_BLOCK'
    )
  })

  test('accepts many entries so long as the two sides agree', () => {
    const block = appendBlock(
      null,
      [
        { account: 'a', direction: 'debit', amount: 70n },
        { account: 'b', direction: 'debit', amount: 30n },
        { account: 'c', direction: 'credit', amount: 100n },
      ],
      at(0)
    )
    assert.equal(block.entries.length, 3)
  })

  test('rejects an empty block', () => {
    assert.throws(
      () => appendBlock(null, [], at(0)),
      (e: unknown) => e instanceof LedgerError && e.code === 'EMPTY_ENTRIES'
    )
  })
})

describe('appendBlock: amounts are positive bigint minor units', () => {
  test('rejects a zero amount', () => {
    assert.throws(
      () =>
        appendBlock(
          null,
          [
            { account: 'a', direction: 'debit', amount: 0n },
            { account: 'b', direction: 'credit', amount: 0n },
          ],
          at(0)
        ),
      (e: unknown) => e instanceof LedgerError && e.code === 'NON_POSITIVE_AMOUNT'
    )
  })

  test('rejects a negative amount, because direction carries the sign', () => {
    assert.throws(
      () =>
        appendBlock(
          null,
          [
            { account: 'a', direction: 'debit', amount: -100n },
            { account: 'b', direction: 'credit', amount: -100n },
          ],
          at(0)
        ),
      (e: unknown) => e instanceof LedgerError && e.code === 'NON_POSITIVE_AMOUNT'
    )
  })

  test('rejects a float even when it balances', () => {
    assert.throws(
      () =>
        appendBlock(
          null,
          [
            // A caller reaching this package from untyped JavaScript is the
            // realistic route for a float to arrive, so the guard is a runtime
            // check rather than only a type.
            { account: 'a', direction: 'debit', amount: 10.5 as unknown as bigint },
            { account: 'b', direction: 'credit', amount: 10.5 as unknown as bigint },
          ],
          at(0)
        ),
      (e: unknown) => e instanceof LedgerError && e.code === 'NON_POSITIVE_AMOUNT'
    )
  })

  test('handles amounts far beyond what a float could hold exactly', () => {
    const huge = 9_007_199_254_740_993n // Number.MAX_SAFE_INTEGER + 2
    const block = appendBlock(null, transfer('a', 'b', huge), at(0))
    assert.equal(block.entries[0]!.amount, huge)
  })
})

describe('appendBlock: direction', () => {
  test('rejects a direction that is neither debit nor credit', () => {
    assert.throws(
      () =>
        appendBlock(
          null,
          [
            // A caller reaching this package from untyped JavaScript is the
            // realistic route for a malformed direction to arrive, same
            // reasoning as the float-amount guard above: the check is a
            // runtime guard, not only a type, so it needs its own test to
            // reach the branch a type system alone would exclude.
            { account: 'a', direction: 'sideways' as unknown as Entry['direction'], amount: 100n },
            { account: 'b', direction: 'credit', amount: 100n },
          ],
          at(0)
        ),
      (e: unknown) => e instanceof LedgerError && e.code === 'INVALID_DIRECTION'
    )
  })
})

describe('appendBlock: account identifiers', () => {
  test('rejects an empty account', () => {
    assert.throws(
      () => appendBlock(null, transfer('', 'b', 100n), at(0)),
      (e: unknown) => e instanceof LedgerError && e.code === 'INVALID_ACCOUNT'
    )
  })

  for (const account of ['customer:alice', 'a;b', 'a\nb', 'merchant:kadē']) {
    test(`accepts ${JSON.stringify(account)}, because the canonical form is length-prefixed`, () => {
      const block = appendBlock(null, transfer(account, 'b', 100n), at(0))
      assert.equal(block.entries[0]!.account, account)
    })
  }
})

describe('appendBlock: timestamps', () => {
  test('rejects a timestamp that is not ISO 8601 UTC with milliseconds', () => {
    assert.throws(
      () => appendBlock(null, transfer('a', 'b', 100n), '2066-01-01 00:00:00'),
      (e: unknown) => e instanceof LedgerError && e.code === 'INVALID_TIMESTAMP'
    )
  })

  test('defaults to now, in the accepted format', () => {
    const block = appendBlock(null, transfer('a', 'b', 100n))
    assert.match(block.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})

describe('appendBlock: sealing', () => {
  test('opens a chain at seq 0 with the genesis predecessor', () => {
    const block = appendBlock(null, transfer('a', 'b', 100n), at(0))
    assert.equal(block.seq, 0)
    assert.equal(block.prevHash, GENESIS_PREV_HASH)
  })

  test('copies entries, so mutating the caller-owned array cannot alter the block', () => {
    const entries = transfer('a', 'b', 100n)
    const block = appendBlock(null, entries, at(0))
    ;(entries[0] as { amount: bigint }).amount = 999n
    assert.equal(block.entries[0]!.amount, 100n)
  })
})
