import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { assignCell } from '../src/cell-router/stable-hash.ts'

describe('assignCell', () => {
  test('the same customer always lands on the same Cell', () => {
    const first = assignCell('customer-123', ['cell-1', 'cell-2'])
    const second = assignCell('customer-123', ['cell-1', 'cell-2'])
    assert.equal(first, second)
  })

  test('assignment does not depend on the order Cells are listed', () => {
    const a = assignCell('customer-123', ['cell-1', 'cell-2'])
    const b = assignCell('customer-123', ['cell-2', 'cell-1'])
    assert.equal(a, b)
  })

  test('every assignment is one of the configured Cells', () => {
    const cellIds = ['cell-1', 'cell-2', 'cell-3']
    for (let i = 0; i < 50; i++) {
      const assigned = assignCell(`customer-${i}`, cellIds)
      assert.ok(cellIds.includes(assigned))
    }
  })

  test('across many customers, more than one Cell is actually used', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) {
      seen.add(assignCell(`customer-${i}`, ['cell-1', 'cell-2']))
    }
    assert.equal(seen.size, 2)
  })

  test('rejects an empty Cell set', () => {
    assert.throws(() => assignCell('customer-123', []))
  })
})
