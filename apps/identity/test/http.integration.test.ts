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
import { PaymentsService, InMemoryIdempotencyStore, InMemoryLimitsStore } from '@arka/payments'
import type { TransferResult } from '@arka/payments'
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
  const payments = new PaymentsService({
    accounts,
    ledger,
    idempotency: new InMemoryIdempotencyStore<TransferResult>(),
    limits: new InMemoryLimitsStore(),
    qrSigningKey: 'test-qr-signing-key',
  })
  return { identity, accounts, ledger, payments }
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
    await accounts.open('customer:test-bob', 'cust-test-bob', 'Test Bob')
    await built.ledger.record([
      { account: 'bank:reserve', direction: 'debit', amount: 5_000_00n },
      { account: 'customer:test-alice', direction: 'credit', amount: 5_000_00n },
    ])

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .overrideProvider(AccountsService)
      .useValue(accounts)
      .overrideProvider(PaymentsService)
      .useValue(built.payments)
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

  test('an unauthenticated transfer is rejected', async () => {
    const response = await fetch(`${baseUrl}/v1/payments/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'unauth-1' },
      body: JSON.stringify({ fromAccountId: 'customer:test-alice', toAccountId: 'customer:test-bob', amount: '100' }),
    })
    assert.equal(response.status, 401)
  })

  test(
    'screen W3, FR-04 and FR-09: a transfer to a new payee is held for step-up, then succeeds once verified',
    async () => {
      const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

      const held = await fetch(`${baseUrl}/v1/payments/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Idempotency-Key': 'transfer-new-payee-1',
        },
        body: JSON.stringify({ fromAccountId: 'customer:test-alice', toAccountId: 'customer:test-bob', amount: '5000' }),
      })
      assert.equal(held.status, 201)
      const heldBody = await held.json()
      assert.deepEqual(heldBody, { stepUpRequired: true, reason: 'new_payee' })

      const challenge = await fetch(`${baseUrl}/v1/identity/step-up/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ reason: 'new_payee' }),
      })
      assert.equal(challenge.status, 201)
      const { actionToken } = await challenge.json()

      const verify = await fetch(`${baseUrl}/v1/identity/step-up/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionToken, reason: 'new_payee', totpCode: totpAt(mfaSecret) }),
      })
      assert.equal(verify.status, 201)
      const { stepUpToken } = await verify.json()

      const completed = await fetch(`${baseUrl}/v1/payments/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Idempotency-Key': 'transfer-new-payee-1',
          'X-Step-Up-Token': stepUpToken,
        },
        body: JSON.stringify({ fromAccountId: 'customer:test-alice', toAccountId: 'customer:test-bob', amount: '5000' }),
      })
      assert.equal(completed.status, 201)
      const completedBody = await completed.json()
      assert.equal(completedBody.status, 'confirmed')

      const dashboard = await fetch(`${baseUrl}/v1/me/dashboard`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const dashboardBody = await dashboard.json()
      assert.equal(dashboardBody.accounts[0].balance, '495000') // 500000 - 5000, same idempotency key, moved once
    }
  )

  test('a second transfer to the same, now-familiar payee needs no step-up', async () => {
    // Depends on the previous test having already completed a real transfer
    // from test-alice to test-bob. Node's test runner runs sibling tests in
    // one file sequentially by default (no concurrency option is set on this
    // describe), so that ordering holds; stated here rather than left
    // implicit.
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const response = await fetch(`${baseUrl}/v1/payments/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': 'transfer-familiar-payee-1',
      },
      body: JSON.stringify({ fromAccountId: 'customer:test-alice', toAccountId: 'customer:test-bob', amount: '100' }),
    })
    assert.equal(response.status, 201)
    const body = await response.json()
    assert.equal(body.status, 'confirmed')
  })

  test('transferring from an account the session does not own is rejected', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const response = await fetch(`${baseUrl}/v1/payments/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': 'transfer-not-owned-1',
      },
      body: JSON.stringify({ fromAccountId: 'customer:test-bob', toAccountId: 'customer:test-alice', amount: '100' }),
    })
    assert.equal(response.status, 403)
  })

  test('screen W2, FR-06 and FR-08: transaction history carries a confirmed status and a real ledger hash', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const response = await fetch(`${baseUrl}/v1/accounts/customer:test-alice/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(response.status, 200)
    const lines = await response.json()
    assert.ok(lines.length > 0)
    for (const line of lines) {
      assert.equal(line.confirmed, true)
      assert.match(line.ledgerBlockHash, /^[0-9a-f]{64}$/)
    }
  })

  test('history for an account the session does not own is rejected', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const response = await fetch(`${baseUrl}/v1/accounts/customer:test-bob/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(response.status, 403)
  })
})

/** Logs test-alice in over HTTP and returns a ready-to-use access token. */
async function loginAndVerifyMfa(baseUrl: string, secret: string): Promise<string> {
  const login = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-alice', password: 'a genuinely strong test password' }),
  })
  const { mfaToken } = await login.json()

  const mfa = await fetch(`${baseUrl}/v1/auth/mfa/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mfaToken, totpCode: totpAt(secret) }),
  })
  const session = await mfa.json()
  return session.accessToken
}
