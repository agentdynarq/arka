/**
 * Boots the actual compiled app and calls it over real HTTP, not a mock of
 * it. Runs against `dist/`, so `pretest` builds first.
 *
 * `RecoveryService` is overridden with an in-memory-backed instance rather
 * than touching the real control-plane Postgres, same reasoning as
 * `apps/identity` and `apps/recovery`'s own HTTP tests: this file's job is
 * proving the write-check endpoint's wiring and status codes, not
 * re-proving quarantine storage correctness, which
 * `services/recovery/test/pg-stores.integration.test.ts` already does
 * against a real database.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Test } from '@nestjs/testing'
import { NestFactory } from '@nestjs/core'
import { RecoveryService, InMemoryQuarantineStore, InMemoryAuditTrailStore } from '@arka/recovery'
import type { CellHealthChecker, CellEndpoint, CellHealthObservation } from '@arka/recovery'

process.env.CELL_IDS = 'cell-1,cell-2'

const { AppModule } = await import('../dist/app.module.js')

class FakeHealthChecker implements CellHealthChecker {
  async check(endpoint: CellEndpoint): Promise<CellHealthObservation> {
    return { cellId: endpoint.cellId, lastCheckedAt: new Date().toISOString(), latencyMs: 1, infrastructureHealthy: true }
  }
}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let baseUrl = ''
let recovery: RecoveryService

describe('gateway http surface', () => {
  before(async () => {
    recovery = new RecoveryService({
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

  test('a request lands in a named, configured Cell', async () => {
    const response = await fetch(`${baseUrl}/v1/cell-router/customer-123`)
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.customerId, 'customer-123')
    assert.ok(['cell-1', 'cell-2'].includes(body.cellId))
    assert.equal(typeof body.routedAt, 'string')
  })

  test('the same customer always lands in the same Cell', async () => {
    const first = await (await fetch(`${baseUrl}/v1/cell-router/customer-456`)).json()
    const second = await (await fetch(`${baseUrl}/v1/cell-router/customer-456`)).json()
    assert.equal(first.cellId, second.cellId)
  })

  test('write-check succeeds for a customer routed to an unquarantined Cell', async () => {
    const response = await fetch(`${baseUrl}/v1/cell-router/customer-123/write-check`)
    assert.equal(response.status, 200)
  })

  test(
    'quarantining the Cell a customer is routed to rejects write-check with a read-only error, while ' +
      'the plain read route still succeeds and an unaffected Cell keeps serving writes',
    async () => {
      const routed = await (await fetch(`${baseUrl}/v1/cell-router/customer-789`)).json()
      const quarantinedCellId = routed.cellId
      const otherCellId = quarantinedCellId === 'cell-1' ? 'cell-2' : 'cell-1'

      await recovery.requestQuarantine(quarantinedCellId, 'test-induced fault', 'operator-1')
      await recovery.approveQuarantine(quarantinedCellId, 'operator-2')

      const read = await fetch(`${baseUrl}/v1/cell-router/customer-789`)
      assert.equal(read.status, 200, 'a read attempt against the quarantined Cell still succeeds')

      const write = await fetch(`${baseUrl}/v1/cell-router/customer-789/write-check`)
      assert.equal(write.status, 403, 'a write attempt against the quarantined Cell is rejected')
      const writeBody = await write.json()
      assert.equal(writeBody.code, 'CELL_QUARANTINED')

      // Find a customer id that is genuinely routed to the other, unaffected Cell.
      let otherCustomerWrite: Response | null = null
      for (let i = 0; i < 50; i++) {
        const candidate = `customer-probe-${i}`
        const candidateRoute = await (await fetch(`${baseUrl}/v1/cell-router/${candidate}`)).json()
        if (candidateRoute.cellId === otherCellId) {
          otherCustomerWrite = await fetch(`${baseUrl}/v1/cell-router/${candidate}/write-check`)
          break
        }
      }
      assert.ok(otherCustomerWrite, 'expected at least one probe customer to land on the other Cell')
      assert.equal(otherCustomerWrite.status, 200, 'the other Cell keeps serving writes throughout')
    }
  )
})
