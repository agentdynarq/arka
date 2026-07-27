import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { positiveAmount, nonNegativeAmount, signedAmount, cellId, apiError } from '../src/common.ts'

describe('positiveAmount', () => {
  test('parses a digit string into a bigint', () => {
    assert.equal(positiveAmount.parse('100'), 100n)
  })

  test('rejects zero', () => {
    assert.throws(() => positiveAmount.parse('0'))
  })

  test('rejects a negative amount', () => {
    assert.throws(() => positiveAmount.parse('-5'))
  })

  test('rejects a float, because money is never a float', () => {
    assert.throws(() => positiveAmount.parse('1.5'))
  })

  test('rejects a leading zero', () => {
    assert.throws(() => positiveAmount.parse('007'))
  })

  test('rejects a JSON number, only a string is accepted', () => {
    assert.throws(() => positiveAmount.parse(100))
  })
})

describe('nonNegativeAmount', () => {
  test('allows zero for a balance that is genuinely empty', () => {
    assert.equal(nonNegativeAmount.parse('0'), 0n)
  })

  test('rejects a negative balance', () => {
    assert.throws(() => nonNegativeAmount.parse('-1'))
  })
})

describe('signedAmount', () => {
  test('allows a negative delta', () => {
    assert.equal(signedAmount.parse('-42'), -42n)
  })

  test('allows a positive delta', () => {
    assert.equal(signedAmount.parse('42'), 42n)
  })
})

describe('cellId', () => {
  test('accepts any non-empty string, because a Cell is configuration, not an enum', () => {
    assert.equal(cellId.parse('cell-1'), 'cell-1')
    assert.equal(cellId.parse('anything-a-deploy-chooses-to-call-it'), 'anything-a-deploy-chooses-to-call-it')
  })

  test('rejects an empty string', () => {
    assert.throws(() => cellId.parse(''))
  })
})

describe('apiError', () => {
  test('requires a code and a message', () => {
    assert.throws(() => apiError.parse({ message: 'missing code' }))
    assert.throws(() => apiError.parse({ code: 'missing_message' }))
  })

  test('accepts an optional details payload of any shape', () => {
    const parsed = apiError.parse({ code: 'not_found', message: 'not found', details: { id: '1' } })
    assert.deepEqual(parsed.details, { id: '1' })
  })
})
