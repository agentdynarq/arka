import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { RecoveryService } from '../src/service.ts'
import { InMemoryQuarantineStore } from '../src/memory-quarantine-store.ts'
import { InMemoryAuditTrailStore } from '../src/memory-audit-trail-store.ts'
import { RecoveryError } from '../src/types.ts'
import type { CellEndpoint, CellHealthChecker, CellHealthObservation } from '../src/cell-health.ts'
import type { LedgerIntegrityChecker } from '../src/ledger-integrity.ts'
import type { IntegrityEvidence } from '@arka/ledger'

class FakeHealthChecker implements CellHealthChecker {
  readonly #healthyByCell: Map<string, boolean>

  constructor(healthyByCell: Map<string, boolean>) {
    this.#healthyByCell = healthyByCell
  }

  async check(endpoint: CellEndpoint): Promise<CellHealthObservation> {
    return {
      cellId: endpoint.cellId,
      lastCheckedAt: new Date().toISOString(),
      latencyMs: 7,
      infrastructureHealthy: this.#healthyByCell.get(endpoint.cellId) ?? true,
    }
  }
}

/** Never touches Postgres: RecoveryService's own logic (which Cell, refusing an unknown one) is what's under test here. */
class FakeIntegrityChecker implements LedgerIntegrityChecker {
  readonly #cleanByCell: Map<string, boolean>
  calls: CellEndpoint[] = []

  constructor(cleanByCell = new Map<string, boolean>()) {
    this.#cleanByCell = cleanByCell
  }

  async verify(endpoint: CellEndpoint, options?: { upTo?: number }): Promise<IntegrityEvidence> {
    this.calls.push(endpoint)
    const clean = this.#cleanByCell.get(endpoint.cellId) ?? true
    return {
      cellId: endpoint.cellId,
      verifiedAt: new Date().toISOString(),
      upTo: options?.upTo ?? null,
      result: clean
        ? { ok: true, records: 3, rootHash: 'root-hash' }
        : { ok: false, records: 3, rootHash: null, brokenAt: 1, reason: 'hash mismatch' },
    }
  }
}

const ENDPOINTS: CellEndpoint[] = [
  { cellId: 'cell-1', postgresUrl: 'postgres://fake', redisUrl: 'redis://fake' },
  { cellId: 'cell-2', postgresUrl: 'postgres://fake', redisUrl: 'redis://fake' },
]

function buildService(healthyByCell = new Map<string, boolean>(), integrityChecker = new FakeIntegrityChecker()) {
  return new RecoveryService({
    quarantineStore: new InMemoryQuarantineStore(),
    auditTrailStore: new InMemoryAuditTrailStore(),
    healthChecker: new FakeHealthChecker(healthyByCell),
    integrityChecker,
    cellEndpoints: ENDPOINTS,
  })
}

describe('RecoveryService: quarantine with dual approval (FR-22)', () => {
  test('a request alone does not quarantine: it takes a second, distinct operator', async () => {
    const recovery = buildService()
    const requested = await recovery.requestQuarantine('cell-1', 'anomalous write volume', 'operator-1')
    assert.equal(requested.state, 'pending_second_approval')
    assert.equal(await recovery.isQuarantined('cell-1'), false)
  })

  test('a second, distinct operator approving finalises the quarantine', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'anomalous write volume', 'operator-1')
    const approved = await recovery.approveQuarantine('cell-1', 'operator-2')

    assert.equal(approved.state, 'quarantined')
    assert.deepEqual(approved.approvedBy, ['operator-1', 'operator-2'])
    assert.equal(await recovery.isQuarantined('cell-1'), true)
  })

  test('the same operator cannot approve their own request', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'anomalous write volume', 'operator-1')

    await assert.rejects(
      () => recovery.approveQuarantine('cell-1', 'operator-1'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'ALREADY_APPROVED_BY_THIS_OPERATOR'
    )
    assert.equal(await recovery.isQuarantined('cell-1'), false)
  })

  test('requesting quarantine on an already-quarantined Cell is rejected', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    await assert.rejects(
      () => recovery.requestQuarantine('cell-1', 'reason', 'operator-3'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'CELL_ALREADY_QUARANTINED'
    )
  })

  test('requesting quarantine while one is already pending is rejected', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')

    await assert.rejects(
      () => recovery.requestQuarantine('cell-1', 'another reason', 'operator-2'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'QUARANTINE_ALREADY_PENDING'
    )
  })

  test('approving with nothing pending is rejected', async () => {
    const recovery = buildService()
    await assert.rejects(
      () => recovery.approveQuarantine('cell-1', 'operator-1'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'NO_PENDING_ACTION'
    )
  })

  test('a third operator approving an already-quarantined Cell finds nothing pending', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    await assert.rejects(
      () => recovery.approveQuarantine('cell-1', 'operator-3'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'NO_PENDING_ACTION'
    )
  })

  test('lifting requires a Cell to actually be quarantined', async () => {
    const recovery = buildService()
    await assert.rejects(
      () => recovery.requestLiftQuarantine('cell-1', 'operator-1'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'CELL_NOT_QUARANTINED'
    )
  })

  test('lifting a quarantine is the same dual-approval mechanism in reverse, and resets approvedBy', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    const requested = await recovery.requestLiftQuarantine('cell-1', 'operator-3')
    assert.equal(requested.state, 'pending_second_approval')
    assert.equal(await recovery.isQuarantined('cell-1'), true, 'still quarantined until the lift is approved')

    const lifted = await recovery.approveLiftQuarantine('cell-1', 'operator-1')
    assert.equal(lifted.state, 'none')
    assert.deepEqual(lifted.approvedBy, [])
    assert.equal(await recovery.isQuarantined('cell-1'), false)
  })

  test('a quarantined Cell can be quarantined again after a full lift cycle', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'first incident', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')
    await recovery.requestLiftQuarantine('cell-1', 'operator-1')
    await recovery.approveLiftQuarantine('cell-1', 'operator-2')

    const requestedAgain = await recovery.requestQuarantine('cell-1', 'second incident', 'operator-3')
    assert.equal(requestedAgain.state, 'pending_second_approval')
    assert.deepEqual(requestedAgain.approvedBy, ['operator-3'], 'no leakage from the previous cycle')
  })
})

describe('RecoveryService: live Cell health (FR-21)', () => {
  test('an unquarantined, healthy Cell reports healthy', async () => {
    const recovery = buildService(new Map([['cell-1', true]]))
    const map = await recovery.healthMap()
    assert.equal(map.find((c) => c.cellId === 'cell-1')?.status, 'healthy')
  })

  test('an unquarantined Cell with unreachable infrastructure reports degraded', async () => {
    const recovery = buildService(new Map([['cell-1', false]]))
    const map = await recovery.healthMap()
    assert.equal(map.find((c) => c.cellId === 'cell-1')?.status, 'degraded')
  })

  test('a quarantined Cell reports quarantined even though its infrastructure is healthy', async () => {
    const recovery = buildService(new Map([['cell-1', true]]))
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    const map = await recovery.healthMap()
    assert.equal(map.find((c) => c.cellId === 'cell-1')?.status, 'quarantined')
  })

  test('quarantining one Cell leaves every other Cell unaffected', async () => {
    const recovery = buildService(new Map([['cell-1', true], ['cell-2', true]]))
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    const map = await recovery.healthMap()
    assert.equal(map.find((c) => c.cellId === 'cell-1')?.status, 'quarantined')
    assert.equal(map.find((c) => c.cellId === 'cell-2')?.status, 'healthy')
  })
})

describe('RecoveryService: on-demand ledger integrity verification with export (FR-23)', () => {
  test('verifying a configured Cell returns its evidence', async () => {
    const recovery = buildService()
    const evidence = await recovery.verifyIntegrity('cell-1')
    assert.equal(evidence.cellId, 'cell-1')
    assert.equal(evidence.result.ok, true)
  })

  test('a broken chain reports where, not merely that', async () => {
    const recovery = buildService(undefined, new FakeIntegrityChecker(new Map([['cell-1', false]])))
    const evidence = await recovery.verifyIntegrity('cell-1')
    assert.equal(evidence.result.ok, false)
    assert.equal(evidence.result.brokenAt, 1)
  })

  test('verifying an unconfigured Cell is rejected rather than silently checking nothing', async () => {
    const recovery = buildService()
    await assert.rejects(
      () => recovery.verifyIntegrity('cell-9'),
      (e: unknown) => e instanceof RecoveryError && e.code === 'CELL_NOT_FOUND'
    )
  })

  test('verification is not gated on quarantine: P3 relies on checking a quarantined Cell', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    const evidence = await recovery.verifyIntegrity('cell-1')
    assert.equal(evidence.result.ok, true)
  })

  test('verifying every Cell in one call covers each configured endpoint exactly once', async () => {
    const checker = new FakeIntegrityChecker()
    const recovery = buildService(undefined, checker)
    const evidence = await recovery.verifyAllIntegrity()

    assert.deepEqual(
      evidence.map((e) => e.cellId).sort(),
      ['cell-1', 'cell-2']
    )
    assert.equal(checker.calls.length, 2)
  })
})

describe('RecoveryService: append-only operator audit trail (FR-25)', () => {
  test('every quarantine and lift transition is recorded', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')
    await recovery.requestLiftQuarantine('cell-1', 'operator-1')
    await recovery.approveLiftQuarantine('cell-1', 'operator-2')

    const trail = await recovery.auditTrail()
    assert.deepEqual(
      trail.map((r) => r.action),
      ['quarantine.requested', 'quarantine.approved', 'lift.requested', 'lift.approved']
    )
    assert.ok(trail.every((r) => r.cellId === 'cell-1'))
  })

  test('the audit trail verifies clean', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await recovery.approveQuarantine('cell-1', 'operator-2')

    const result = await recovery.verifyAuditTrail()
    assert.equal(result.ok, true)
    assert.equal(result.records, 2)
  })

  test('a rejected action (same operator twice) does not append to the audit trail', async () => {
    const recovery = buildService()
    await recovery.requestQuarantine('cell-1', 'reason', 'operator-1')
    await assert.rejects(() => recovery.approveQuarantine('cell-1', 'operator-1'))

    const trail = await recovery.auditTrail()
    assert.equal(trail.length, 1, 'only the original request, not a second entry for the rejected approval')
  })
})
