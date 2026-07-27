import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { quarantineApproval, quarantineStatus, integrityVerificationResult } from '../src/recovery.ts'

describe('quarantineApproval', () => {
  test('records who approved, not merely that someone did', () => {
    const parsed = quarantineApproval.parse({ cellId: 'cell-1', approvedBy: 'operator-a' })
    assert.equal(parsed.approvedBy, 'operator-a')
  })
})

describe('quarantineStatus', () => {
  test('a quarantined state carries the approvals that produced it', () => {
    const parsed = quarantineStatus.parse({
      cellId: 'cell-1',
      state: 'quarantined',
      approvedBy: ['operator-a', 'operator-b'],
    })
    assert.equal(parsed.approvedBy.length, 2)
  })

  test('rejects an unknown state', () => {
    assert.throws(() =>
      quarantineStatus.parse({ cellId: 'cell-1', state: 'half-quarantined', approvedBy: [] }),
    )
  })
})

describe('integrityVerificationResult', () => {
  test('a clean chain has no brokenAt and no reason', () => {
    const parsed = integrityVerificationResult.parse({
      ok: true,
      records: 12,
      rootHash: 'abc123',
    })
    assert.equal(parsed.ok, true)
    assert.equal(parsed.brokenAt, undefined)
  })

  test('a broken chain reports where, not merely that', () => {
    const parsed = integrityVerificationResult.parse({
      ok: false,
      records: 12,
      rootHash: null,
      brokenAt: 4,
      reason: 'hash mismatch',
    })
    assert.equal(parsed.brokenAt, 4)
  })
})
