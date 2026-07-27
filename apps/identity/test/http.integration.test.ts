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
import { PaymentsService, InMemoryIdempotencyStore, InMemoryLimitsStore, InMemoryAgentCashStore } from '@arka/payments'
import type { TransferResult } from '@arka/payments'
import { NotificationsService, InMemoryNotificationStore } from '@arka/notifications'
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
    // The default (10 per 60s) is correct in production and is proven
    // directly in services/identity's own tests. This suite logs "alice" in
    // far more than 10 times across its growing list of journeys sharing one
    // in-memory rate limiter for the whole file; a generous limit here tests
    // the HTTP boundary this file actually owns without also re-triggering a
    // real security control the volume only exists because it's a test.
    loginRateLimit: { limit: 1000, windowMs: 60_000 },
  })
  const payments = new PaymentsService({
    accounts,
    ledger,
    idempotency: new InMemoryIdempotencyStore<TransferResult>(),
    limits: new InMemoryLimitsStore(),
    agentCash: new InMemoryAgentCashStore(),
    qrSigningKey: 'test-qr-signing-key',
  })
  const notifications = new NotificationsService({ store: new InMemoryNotificationStore() })
  return { identity, accounts, ledger, payments, notifications }
}

let app: Awaited<ReturnType<typeof NestFactory.create>>
let baseUrl = ''
let identity: IdentityService
let accounts: AccountsService
let mfaSecret: string
let bobMfaSecret: string

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
    bobMfaSecret = generateTotpSecret()
    await identity.createUser({
      username: 'test-bob',
      password: 'a genuinely strong test password for bob',
      role: 'customer',
      customerId: 'cust-test-bob',
      mfaSecret: bobMfaSecret,
    })
    await accounts.open('customer:test-alice', 'cust-test-alice', 'Test Alice')
    await accounts.open('customer:test-bob', 'cust-test-bob', 'Test Bob')
    await accounts.open('agent:test-west', 'cust-agent-test-west', 'Test West Branch Agent')
    await built.ledger.record([
      { account: 'bank:reserve', direction: 'debit', amount: 5_000_00n },
      { account: 'customer:test-alice', direction: 'credit', amount: 5_000_00n },
    ])
    await built.ledger.record([
      { account: 'bank:reserve', direction: 'debit', amount: 5_000_00n },
      { account: 'agent:test-west', direction: 'credit', amount: 5_000_00n },
    ])

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(IdentityService)
      .useValue(identity)
      .overrideProvider(AccountsService)
      .useValue(accounts)
      .overrideProvider(PaymentsService)
      .useValue(built.payments)
      .overrideProvider(NotificationsService)
      .useValue(built.notifications)
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

  test('FR-15: ?limit= caps history to the newest few lines, the server side of low-bandwidth mode', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const full = await fetch(`${baseUrl}/v1/accounts/customer:test-alice/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const fullLines = await full.json()
    assert.ok(fullLines.length > 1, 'test fixture should already have more than one history line by this point')

    const limited = await fetch(`${baseUrl}/v1/accounts/customer:test-alice/history?limit=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(limited.status, 200)
    const limitedLines = await limited.json()
    assert.equal(limitedLines.length, 1)
    assert.equal(limitedLines[0].seq, fullLines[0].seq, 'limit still returns the newest line first')
  })

  test('?limit=0 is rejected rather than silently treated as unlimited', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const response = await fetch(`${baseUrl}/v1/accounts/customer:test-alice/history?limit=0`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(response.status, 400)
  })

  test('FR-19: a transfer to a familiar payee notifies both sender and receiver', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const transferResponse = await fetch(`${baseUrl}/v1/payments/transfers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Idempotency-Key': 'notify-1',
      },
      body: JSON.stringify({ fromAccountId: 'customer:test-alice', toAccountId: 'customer:test-bob', amount: '100' }),
    })
    assert.equal(transferResponse.status, 201)

    const aliceInbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const aliceNotifications = await aliceInbox.json()
    const sentAlert = aliceNotifications.find((n: { title: string }) => n.title === 'Money sent')
    assert.ok(sentAlert, 'the sender must be notified')
    assert.equal(sentAlert.readAt, null)

    const bobLogin = await loginAndVerifyMfaAs(baseUrl, 'test-bob', 'a genuinely strong test password for bob', bobMfaSecret)
    const bobInbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${bobLogin}` } })
    const bobNotifications = await bobInbox.json()
    assert.ok(
      bobNotifications.some((n: { title: string }) => n.title === 'Money received'),
      'the receiver must be notified too, not only the sender'
    )
  })

  test('an unauthenticated notifications request is rejected', async () => {
    const response = await fetch(`${baseUrl}/v1/notifications`)
    assert.equal(response.status, 401)
  })

  test('POST /v1/notifications/:id/read marks a notification read, and rejects one belonging to someone else', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)
    const inbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const [notification] = await inbox.json()

    const marked = await fetch(`${baseUrl}/v1/notifications/${notification.notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(marked.status, 201)
    const markedBody = await marked.json()
    assert.ok(markedBody.readAt)

    const bobLogin = await loginAndVerifyMfaAs(baseUrl, 'test-bob', 'a genuinely strong test password for bob', bobMfaSecret)
    const forbidden = await fetch(`${baseUrl}/v1/notifications/${notification.notificationId}/read`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobLogin}` },
    })
    assert.equal(forbidden.status, 403, "bob must not be able to mark alice's notification read")
  })

  test('FR-12 over HTTP: reading a limit needs no step-up, changing one does', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const read = await fetch(`${baseUrl}/v1/payments/limits/customer:test-alice`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    assert.equal(read.status, 200)

    const withoutStepUp = await fetch(`${baseUrl}/v1/payments/limits/customer:test-alice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ newLimit: '100000' }),
    })
    assert.equal(withoutStepUp.status, 428, 'PRECONDITION_REQUIRED')
  })

  test('FR-12 and FR-20 together: changing a limit with step-up succeeds and raises a security alert', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const challenge = await fetch(`${baseUrl}/v1/identity/step-up/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ reason: 'over_limit' }),
    })
    const { actionToken } = await challenge.json()

    const verify = await fetch(`${baseUrl}/v1/identity/step-up/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionToken, reason: 'over_limit', totpCode: totpAt(mfaSecret) }),
    })
    const { stepUpToken } = await verify.json()

    const changed = await fetch(`${baseUrl}/v1/payments/limits/customer:test-alice`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Step-Up-Token': stepUpToken,
      },
      body: JSON.stringify({ newLimit: '250000' }),
    })
    assert.equal(changed.status, 201)
    const changedBody = await changed.json()
    assert.equal(changedBody.limit, '250000')

    const inbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const notifications = await inbox.json()
    assert.ok(notifications.some((n: { title: string }) => n.title === 'Daily limit changed'))
  })

  test('FR-16: agent cash-in, the OTP is read from the customer\'s own inbox, exactly as a real customer would', async () => {
    const accessToken = await loginAndVerifyMfa(baseUrl, mfaSecret)

    const requested = await fetch(`${baseUrl}/v1/payments/agent-cash/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1',
        agentAccountId: 'agent:test-west',
        customerAccountId: 'customer:test-alice',
        direction: 'cash_in',
        amount: '2000',
      }),
    })
    assert.equal(requested.status, 201)
    const requestedBody = await requested.json()
    assert.ok(requestedBody.requestId)
    assert.equal(typeof requestedBody.otpCode, 'undefined', 'the OTP must never be returned to the agent directly')

    const inbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const notifications = await inbox.json()
    const alert = notifications.find((n: { title: string }) => n.title === 'Agent cash request')
    assert.ok(alert, 'the customer must be told, out of band, via their own inbox')
    const otpCode = /code with them only if you agree: (\d{6})/.exec(alert.message)?.[1]
    assert.ok(otpCode, 'the OTP must be discoverable from the notification the same way a real customer would read it')

    const completed = await fetch(`${baseUrl}/v1/payments/agent-cash/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'agent-cash-1' },
      body: JSON.stringify({ requestId: requestedBody.requestId, otpCode }),
    })
    assert.equal(completed.status, 201)
    const completedBody = await completed.json()
    assert.equal(completedBody.status, 'confirmed')

    const dashboard = await fetch(`${baseUrl}/v1/me/dashboard`, { headers: { Authorization: `Bearer ${accessToken}` } })
    const dashboardBody = await dashboard.json()
    const aliceAccount = dashboardBody.accounts.find((a: { accountId: string }) => a.accountId === 'customer:test-alice')
    assert.ok(BigInt(aliceAccount.balance) >= 2000n, 'the cash-in must have credited the customer')
  })

  test('FR-16: completing with a wrong OTP is rejected, and the correct one still works afterward', async () => {
    const requested = await fetch(`${baseUrl}/v1/payments/agent-cash/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1',
        agentAccountId: 'agent:test-west',
        customerAccountId: 'customer:test-bob',
        direction: 'cash_in',
        amount: '500',
      }),
    })
    const { requestId } = await requested.json()

    const wrongAttempt = await fetch(`${baseUrl}/v1/payments/agent-cash/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'agent-cash-wrong-1' },
      body: JSON.stringify({ requestId, otpCode: '000000' }),
    })
    assert.equal(wrongAttempt.status, 401)

    const bobLogin = await loginAndVerifyMfaAs(baseUrl, 'test-bob', 'a genuinely strong test password for bob', bobMfaSecret)
    const inbox = await fetch(`${baseUrl}/v1/notifications`, { headers: { Authorization: `Bearer ${bobLogin}` } })
    const notifications = await inbox.json()
    const alert = notifications.find((n: { title: string }) => n.title === 'Agent cash request')
    const otpCode = /code with them only if you agree: (\d{6})/.exec(alert.message)?.[1]

    const correctAttempt = await fetch(`${baseUrl}/v1/payments/agent-cash/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'agent-cash-wrong-1-retry' },
      body: JSON.stringify({ requestId, otpCode }),
    })
    assert.equal(correctAttempt.status, 201)
  })
})

/** Logs test-alice in over HTTP and returns a ready-to-use access token. */
async function loginAndVerifyMfa(baseUrl: string, secret: string): Promise<string> {
  return loginAndVerifyMfaAs(baseUrl, 'test-alice', 'a genuinely strong test password', secret)
}

/** Logs any seeded user in over HTTP and returns a ready-to-use access token. */
async function loginAndVerifyMfaAs(baseUrl: string, username: string, password: string, secret: string): Promise<string> {
  const login = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
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
