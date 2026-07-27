/**
 * Boots the actual compiled Nest app and calls it over real HTTP, same
 * pattern as `apps/gateway` and `apps/identity`. Runs against `dist/`, so
 * `pretest` builds first.
 *
 * Overrides `RecoveryService` with an in-memory-backed instance rather than
 * touching Postgres, same reasoning as `apps/identity/test/http.integration.test.ts`:
 * storage correctness is already proven against a real database by
 * `services/recovery/test/pg-stores.integration.test.ts`, and this app and
 * that package's own tests would otherwise race to reset the shared
 * `recovery` schema if `turbo run test` ever runs both concurrently.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Test } from '@nestjs/testing'
import { NestFactory } from '@nestjs/core'
import { RecoveryService, InMemoryQuarantineStore, InMemoryAuditTrailStore } from '@arka/recovery'
import type { CellHealthChecker, CellEndpoint, CellHealthObservation } from '@arka/recovery'

const { AppModule } = await import('../dist/app.module.js')

class FakeHealthChecker implements CellHealthChecker {
  async check(endpoint: CellEndpoint): Promise<CellHealthObservation> {
    return { cellId: endpoint.cellId, lastCheckedAt: new Date().toISOString(), latencyMs: 3, infrastructureHealthy: true }
  }
}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let baseUrl = ''

describe('recovery http surface', () => {
  before(async () => {
    const recovery = new RecoveryService({
      quarantineStore: new InMemoryQuarantineStore(),
      auditTrailStore: new InMemoryAuditTrailStore(),
      healthChecker: new FakeHealthChecker(),
      cellEndpoints: [
        { cellId: 'cell-1', postgresUrl: '', redisUrl: '' },
        { cellId: 'cell-2', postgresUrl: '', redisUrl: '' },
      ],
    })

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(RecoveryService)
      .useValue(recovery)
      .compile()

    app = moduleRef.createNestApplication()
    await app.init()
    await app.listen(0)
    const address = app.getHttpServer().address()
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(async () => {
    await app.close()
  })

  test('healthz reports ok', async () => {
    const response = await fetch(`${baseUrl}/healthz`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })

  test('health map reports every configured Cell healthy before any quarantine', async () => {
    const response = await fetch(`${baseUrl}/v1/recovery/health-map`)
    assert.equal(response.status, 200)
    const map = await response.json()
    assert.equal(map.length, 2)
    assert.ok(map.every((c: { status: string }) => c.status === 'healthy'))
  })

  test(
    'the full FR-22 journey: request, a lone requester does not quarantine, a second distinct ' +
      'operator does, and quarantining one Cell leaves the other healthy',
    async () => {
      const request = await fetch(`${baseUrl}/v1/recovery/quarantine/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId: 'cell-1', reason: 'anomalous write volume', requestedBy: 'operator-1' }),
      })
      assert.equal(request.status, 201)
      const requested = await request.json()
      assert.equal(requested.state, 'pending_second_approval')

      const sameOperator = await fetch(`${baseUrl}/v1/recovery/quarantine/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId: 'cell-1', approvedBy: 'operator-1' }),
      })
      assert.equal(sameOperator.status, 409)

      const approve = await fetch(`${baseUrl}/v1/recovery/quarantine/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cellId: 'cell-1', approvedBy: 'operator-2' }),
      })
      assert.equal(approve.status, 201)
      const approved = await approve.json()
      assert.equal(approved.state, 'quarantined')

      const map = await (await fetch(`${baseUrl}/v1/recovery/health-map`)).json()
      assert.equal(map.find((c: { cellId: string }) => c.cellId === 'cell-1').status, 'quarantined')
      assert.equal(map.find((c: { cellId: string }) => c.cellId === 'cell-2').status, 'healthy')
    }
  )

  test('the audit trail records the journey and verifies clean', async () => {
    const trail = await (await fetch(`${baseUrl}/v1/recovery/audit-trail`)).json()
    assert.deepEqual(
      trail.map((e: { action: string }) => e.action),
      ['quarantine.requested', 'quarantine.approved']
    )

    const verify = await (await fetch(`${baseUrl}/v1/recovery/audit-trail/verify`)).json()
    assert.equal(verify.ok, true)
    assert.equal(verify.records, 2)
  })

  test('lifting the quarantine requires dual approval too', async () => {
    const request = await fetch(`${baseUrl}/v1/recovery/quarantine/lift/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellId: 'cell-1', requestedBy: 'operator-3' }),
    })
    assert.equal(request.status, 201)

    const stillQuarantined = await (await fetch(`${baseUrl}/v1/recovery/health-map`)).json()
    assert.equal(stillQuarantined.find((c: { cellId: string }) => c.cellId === 'cell-1').status, 'quarantined')

    const approve = await fetch(`${baseUrl}/v1/recovery/quarantine/lift/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cellId: 'cell-1', approvedBy: 'operator-1' }),
    })
    assert.equal(approve.status, 201)
    const lifted = await approve.json()
    assert.equal(lifted.state, 'none')

    const restored = await (await fetch(`${baseUrl}/v1/recovery/health-map`)).json()
    assert.equal(restored.find((c: { cellId: string }) => c.cellId === 'cell-1').status, 'healthy')
  })
})
