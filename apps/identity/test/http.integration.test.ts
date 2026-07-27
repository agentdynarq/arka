/**
 * Boots the actual compiled Nest app and calls it over real HTTP, same
 * pattern as `apps/gateway/test/cell-router.integration.test.ts`. Runs
 * against `dist/`, so `pretest` builds first.
 *
 * Deliberately does not touch Postgres: `IdentityService` and
 * `AccountsService` are overridden with in-memory-backed instances built the
 * same way `services/identity/test/service.test.ts` builds them. Storage
 * correctness against a real database is already proven exhaustively by
 * `services/identity/test/pg-stores.integration.test.ts`; this test's job is
 * the HTTP boundary, request validation, guard behaviour and the full
 * journey wiring, none of which needs a database. It also sidesteps a real
 * hazard: this app and `@arka/identity`'s own integration tests would
 * otherwise race to reset the same `identity` Postgres schema if `turbo run
 * test` ever runs both packages' test scripts concurrently.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Test } from '@nestjs/testing'
import { NestFactory } from '@nestjs/core'
import { LedgerService, InMemoryLedgerStore } from '@arka/ledger'
import { AccountsService, InMemoryAccountRegistry } from '@arka/accounts'
import {
  IdentityService,
  InMemoryUserStore,
  InMemorySessionStore,
  InMemoryRateLimiter,
  InMemoryRegistryStore,
  InMemoryKycDocumentStore,
  InMemoryAccountOpeningStore,
  generateTotpSecret,
  totpAt,
} from '@arka/identity'

const { AppModule } = await import('../dist/app.module.js')

function buildTestServices() {
  const ledger = new LedgerService(new InMemoryLedgerStore(), { cellId: 'test-cell' })
  const accounts = new AccountsService({ registry: new InMemoryAccountRegistry(), ledger })
  const identity = new IdentityService({
    userStore: new InMemoryUserStore(),
    sessionStore: new InMemorySessionStore(),
    rateLimiter: new InMemoryRateLimiter(),
    registryStore: new InMemoryRegistryStore(),
    kycStore: new InMemoryKycDocumentStore(),
    accountOpenings: new InMemoryAccountOpeningStore(),
    accounts,
  })
  return { identity, accounts, ledger }
}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let baseUrl = ''
let identity: IdentityService
let accounts: AccountsService
let mfaSecret: string

describe('identity http surface', () => {
  before(async () => {
    const built = buildTestServices()
    identity = built.identity
    accounts = built.accounts

    mfaSecret = generateTotpSecret()
    await identity.createUser({
      username: 'test-alice',
      password: 'a genuinely strong test password',
      role: 'customer',
      customerId: 'cust-test-alice',
      mfaSecret,
    })
    await accounts.open('customer:test-alice', 'cust-test-alice', 'Test Alice')
    await built.ledger.record([
      { account: 'bank:reserve', direction: 'debit', amount: 5_000_00n },
      { account: 'customer:test-alice', direction: 'credit', amount: 5_000_00n },
    ])

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .overrideProvider(AccountsService)
      .useValue(accounts)
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

  test('an unauthenticated dashboard request is rejected', async () => {
    const response = await fetch(`${baseUrl}/v1/me/dashboard`)
    assert.equal(response.status, 401)
  })

  test(
    'the full W1 journey: re-verify, login, MFA, and a real dashboard reading a real balance',
    async () => {
      const reverify = await fetch(`${baseUrl}/v1/identity/re-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: 'cust-nobody-registered', registryDocumentId: 'doc-x' }),
      })
      assert.equal(reverify.status, 201)
      const reverifyBody = await reverify.json()
      assert.equal(reverifyBody.verified, false)
      assert.equal(reverifyBody.livenessSimulated, true)

      const login = await fetch(`${baseUrl}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test-alice', password: 'a genuinely strong test password' }),
      })
      assert.equal(login.status, 201)
      const { mfaToken } = await login.json()
      assert.ok(mfaToken)

      const mfa = await fetch(`${baseUrl}/v1/auth/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, totpCode: totpAt(mfaSecret) }),
      })
      assert.equal(mfa.status, 201)
      const session = await mfa.json()
      assert.ok(session.accessToken)
      assert.ok(session.refreshToken)
      assert.equal(session.role, 'customer')

      const dashboard = await fetch(`${baseUrl}/v1/me/dashboard`, {
        headers: { Authorization: `Bearer ${session.accessToken}` },
      })
      assert.equal(dashboard.status, 200)
      const dashboardBody = await dashboard.json()
      assert.equal(dashboardBody.username, 'test-alice')
      assert.equal(dashboardBody.accounts.length, 1)
      assert.equal(dashboardBody.accounts[0].balance, '500000')
      assert.equal(dashboardBody.accounts[0].displayName, 'Test Alice')
    }
  )

  test('a wrong TOTP code does not issue a session', async () => {
    const login = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-alice', password: 'a genuinely strong test password' }),
    })
    const { mfaToken } = await login.json()

    const mfa = await fetch(`${baseUrl}/v1/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken, totpCode: '000000' }),
    })
    assert.equal(mfa.status, 401)
  })

  test('refresh rotation over HTTP: the old refresh token stops working after rotation', async () => {
    const login = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-alice', password: 'a genuinely strong test password' }),
    })
    const { mfaToken } = await login.json()
    const mfa = await fetch(`${baseUrl}/v1/auth/mfa/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mfaToken, totpCode: totpAt(mfaSecret) }),
    })
    const session = await mfa.json()

    const firstRefresh = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
    assert.equal(firstRefresh.status, 201)

    const secondRefresh = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    })
    assert.equal(secondRefresh.status, 401)
  })
})
