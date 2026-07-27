import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { appendAuditRecord, verifyAuditChain, GENESIS_PREV_HASH } from '../src/audit-hash.ts'
import type { AuditRecord } from '../src/audit-hash.ts'

describe('audit hash chain', () => {
  test('the first record links to the genesis sentinel', () => {
    const record = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    assert.equal(record.seq, 0)
    assert.equal(record.prevHash, GENESIS_PREV_HASH)
  })

  test('each record links to its predecessor and seq increments by one', () => {
    const first = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    const second = appendAuditRecord(first, 'operator-2', 'quarantine.approved', 'cell-1')
    assert.equal(second.seq, 1)
    assert.equal(second.prevHash, first.hash)
  })

  test('an empty chain verifies clean with no root hash', () => {
    assert.deepEqual(verifyAuditChain([]), { ok: true, records: 0, rootHash: null })
  })

  test('a valid chain of several records verifies clean and reports the correct root hash', () => {
    const a = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    const b = appendAuditRecord(a, 'operator-2', 'quarantine.approved', 'cell-1')
    const c = appendAuditRecord(b, 'operator-1', 'lift.requested', 'cell-1')

    const result = verifyAuditChain([a, b, c])
    assert.equal(result.ok, true)
    assert.equal(result.records, 3)
    assert.equal(result.rootHash, c.hash)
  })

  test('tampering with any historical record is detected, and located at the right index', () => {
    const a = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    const b = appendAuditRecord(a, 'operator-2', 'quarantine.approved', 'cell-1')
    const c = appendAuditRecord(b, 'operator-1', 'lift.requested', 'cell-1')

    const tampered: AuditRecord = { ...a, actor: 'someone-else' }
    const result = verifyAuditChain([tampered, b, c])

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 0)
  })

  test('a broken predecessor link is detected at the index it breaks, not at genesis', () => {
    const a = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    const b = appendAuditRecord(a, 'operator-2', 'quarantine.approved', 'cell-1')
    const c = appendAuditRecord(b, 'operator-1', 'lift.requested', 'cell-1')

    const forged: AuditRecord = { ...c, prevHash: 'not-the-real-prev-hash' }
    const result = verifyAuditChain([a, b, forged])

    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 2)
  })

  test('deleting a record from the end still leaves a chain that verifies, the known limitation of a hash chain alone', () => {
    const a = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
    const b = appendAuditRecord(a, 'operator-2', 'quarantine.approved', 'cell-1')
    appendAuditRecord(b, 'operator-1', 'lift.requested', 'cell-1')

    const truncated = verifyAuditChain([a, b])
    assert.equal(truncated.ok, true)
    assert.equal(truncated.records, 2)
  })

  test('cellId may be null, for an action that is not about one specific Cell', () => {
    const record = appendAuditRecord(null, 'operator-1', 'health-map.viewed', null)
    assert.equal(record.cellId, null)
    assert.equal(verifyAuditChain([record]).ok, true)
  })
})
