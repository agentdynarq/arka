/**
 * Boots the actual compiled app, not a mock of it, and calls it over real
 * HTTP. Runs against `dist/`, so `pretest` builds first. This is the test
 * that proves the "done when" bar for tonight: a request lands in a named
 * Cell and reports which one it hit.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'

process.env.CELL_IDS = 'cell-1,cell-2'

const { NestFactory } = await import('@nestjs/core')
const { AppModule } = await import('../dist/app.module.js')

let app: any
let baseUrl = ''

describe('gateway http surface', () => {
  before(async () => {
    app = await NestFactory.create(AppModule, { logger: false })
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
})
