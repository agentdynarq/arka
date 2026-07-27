import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { LedgerService, InMemoryLedgerStore } from '@arka/ledger'
import { AccountsService, InMemoryAccountRegistry } from '@arka/accounts'

import { IdentityService } from '../src/service.ts'
import { InMemoryUserStore } from '../src/memory-user-store.ts'
import { InMemorySessionStore } from '../src/memory-session-store.ts'
import { InMemoryRateLimiter } from '../src/memory-rate-limiter.ts'
import { InMemoryRegistryStore } from '../src/memory-registry-store.ts'
import { InMemoryKycDocumentStore } from '../src/memory-kyc-store.ts'
import { InMemoryAccountOpeningStore } from '../src/memory-account-opening-store.ts'
import { generateTotpSecret, totpAt } from '../src/totp.ts'
import { IdentityError } from '../src/types.ts'

function buildService(overrides: Partial<ConstructorParameters<typeof IdentityService>[0]> = {}) {
  const ledger = new LedgerService(new InMemoryLedgerStore(), { cellId: 'test-cell' })
  const accounts = new AccountsService({ registry: new InMemoryAccountRegistry(), ledger })

  return new IdentityService({
    userStore: new InMemoryUserStore(),
    sessionStore: new InMemorySessionStore(),
    rateLimiter: new InMemoryRateLimiter(),
    registryStore: new InMemoryRegistryStore(),
    kycStore: new InMemoryKycDocumentStore(),
    accountOpenings: new InMemoryAccountOpeningStore(),
    accounts,
    maxFailedLogins: 3,
    lockoutMs: 60_000,
    loginRateLimit: { limit: 4, windowMs: 60_000 },
    ...overrides,
  })
}

async function seedCustomer(identity: IdentityService, overrides: { username?: string; password?: string } = {}) {
  const mfaSecret = generateTotpSecret()
  const user = await identity.createUser({
    username: overrides.username ?? 'alice',
    password: overrides.password ?? 'correct horse battery staple',
    role: 'customer',
    customerId: 'cust-alice',
    mfaSecret,
  })
  return { user, mfaSecret }
}

describe('IdentityService: login and MFA (FR-03)', () => {
  test('login never completes to a session directly: it returns an MFA challenge', async () => {
    const identity = buildService()
    await seedCustomer(identity)

    const challenge = await identity.login('alice', 'correct horse battery staple')
    assert.ok(challenge.mfaToken)
    assert.ok(challenge.expiresAt)
  })

  test('a correct TOTP code against the challenge issues a real session', async () => {
    const identity = buildService()
    const { mfaSecret } = await seedCustomer(identity)

    const challenge = await identity.login('alice', 'correct horse battery staple')
    const session = await identity.verifyMfa(challenge.mfaToken, totpAt(mfaSecret))

    assert.ok(session.accessToken)
    assert.ok(session.refreshToken)
    assert.equal(session.role, 'customer')
  })

  test('an incorrect TOTP code is rejected and no session is issued', async () => {
    const identity = buildService()
    await seedCustomer(identity)

    const challenge = await identity.login('alice', 'correct horse battery staple')
    await assert.rejects(
      () => identity.verifyMfa(challenge.mfaToken, '000000'),
      (e: unknown) => e instanceof IdentityError && e.code === 'MFA_CODE_INVALID'
    )
  })

  test('a wrong password is rejected without ever revealing whether the username exists', async () => {
    const identity = buildService()
    await seedCustomer(identity)

    await assert.rejects(
      () => identity.login('alice', 'wrong password'),
      (e: unknown) => e instanceof IdentityError && e.code === 'INVALID_CREDENTIALS'
    )
    await assert.rejects(
      () => identity.login('nobody-registered', 'anything'),
      (e: unknown) => e instanceof IdentityError && e.code === 'INVALID_CREDENTIALS'
    )
  })

  test('calling the API directly cannot skip MFA: an expired or unknown mfaToken is rejected', async () => {
    const identity = buildService()
    await assert.rejects(
      () => identity.verifyMfa('not-a-real-token', '123456'),
      (e: unknown) => e instanceof IdentityError && e.code === 'MFA_CHALLENGE_EXPIRED'
    )
  })
})

describe('IdentityService: account lockout and rate limiting', () => {
  test('repeated wrong passwords lock the account, and a correct password no longer works', async () => {
    const identity = buildService({ loginRateLimit: { limit: 100, windowMs: 60_000 } })
    await seedCustomer(identity)

    for (let i = 0; i < 3; i++) {
      await assert.rejects(() => identity.login('alice', 'wrong'), (e: unknown) => e instanceof IdentityError)
    }

    await assert.rejects(
      () => identity.login('alice', 'correct horse battery staple'),
      (e: unknown) => e instanceof IdentityError && e.code === 'ACCOUNT_LOCKED'
    )
  })

  test('a scripted burst of login attempts engages the rate limiter', async () => {
    const identity = buildService({ loginRateLimit: { limit: 4, windowMs: 60_000 }, maxFailedLogins: 1000 })
    await seedCustomer(identity)

    const outcomes: string[] = []
    for (let i = 0; i < 6; i++) {
      try {
        await identity.login('alice', 'wrong-every-time')
        outcomes.push('unexpected-success')
      } catch (error) {
        outcomes.push(error instanceof IdentityError ? error.code : 'unknown')
      }
    }

    assert.ok(outcomes.slice(0, 4).every((code) => code === 'INVALID_CREDENTIALS'))
    assert.ok(outcomes.slice(4).every((code) => code === 'RATE_LIMITED'), `expected rate limiting, got ${outcomes}`)
  })

  test('a successful login resets the failed-login counter', async () => {
    const identity = buildService({ loginRateLimit: { limit: 100, windowMs: 60_000 } })
    const { mfaSecret } = await seedCustomer(identity)

    await assert.rejects(() => identity.login('alice', 'wrong'), (e: unknown) => e instanceof IdentityError)
    await assert.rejects(() => identity.login('alice', 'wrong'), (e: unknown) => e instanceof IdentityError)

    const challenge = await identity.login('alice', 'correct horse battery staple')
    await identity.verifyMfa(challenge.mfaToken, totpAt(mfaSecret))

    // Two more wrong attempts should not lock, since the counter reset on success (limit is 3).
    await assert.rejects(() => identity.login('alice', 'wrong'), (e: unknown) => e instanceof IdentityError)
    const secondChallenge = await identity.login('alice', 'correct horse battery staple')
    assert.ok(secondChallenge.mfaToken)
  })
})

describe('IdentityService: refresh token rotation', () => {
  async function issuedSession(identity: IdentityService) {
    const { mfaSecret } = await seedCustomer(identity)
    const challenge = await identity.login('alice', 'correct horse battery staple')
    return identity.verifyMfa(challenge.mfaToken, totpAt(mfaSecret))
  }

  test('rotating a fresh refresh token issues a new pair, and the old refresh token no longer works', async () => {
    const identity = buildService()
    const session = await issuedSession(identity)

    const rotated = await identity.refresh(session.refreshToken)
    assert.notEqual(rotated.accessToken, session.accessToken)
    assert.notEqual(rotated.refreshToken, session.refreshToken)

    await assert.rejects(
      () => identity.refresh(session.refreshToken),
      (e: unknown) => e instanceof IdentityError && e.code === 'REFRESH_TOKEN_REUSED'
    )
  })

  test('reusing an already-rotated refresh token invalidates the whole family, not just itself', async () => {
    const identity = buildService()
    const session = await issuedSession(identity)

    const rotated = await identity.refresh(session.refreshToken)

    // The original token is reused here, which must revoke the family...
    await assert.rejects(
      () => identity.refresh(session.refreshToken),
      (e: unknown) => e instanceof IdentityError && e.code === 'REFRESH_TOKEN_REUSED'
    )

    // ...so the legitimately rotated token, which had not itself been reused, must also now be dead.
    await assert.rejects(
      () => identity.refresh(rotated.refreshToken),
      (e: unknown) => e instanceof IdentityError && e.code === 'REFRESH_TOKEN_INVALID'
    )
  })

  test('an access token stops verifying once its family is revoked by reuse detection', async () => {
    const identity = buildService()
    const session = await issuedSession(identity)
    const rotated = await identity.refresh(session.refreshToken)

    assert.ok(await identity.verifyAccessToken(rotated.accessToken))

    await assert.rejects(() => identity.refresh(session.refreshToken), (e: unknown) => e instanceof IdentityError)

    assert.equal(await identity.verifyAccessToken(rotated.accessToken), null)
  })

  test('a genuinely concurrent reuse of the same refresh token still lets exactly one caller win', async () => {
    const identity = buildService()
    const session = await issuedSession(identity)

    const results = await Promise.allSettled([identity.refresh(session.refreshToken), identity.refresh(session.refreshToken)])

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected = results.filter((r) => r.status === 'rejected')
    assert.equal(fulfilled.length, 1, 'exactly one concurrent rotation should succeed')
    assert.equal(rejected.length, 1)
  })

  test('an unknown refresh token is rejected', async () => {
    const identity = buildService()
    await assert.rejects(
      () => identity.refresh('not-a-real-refresh-token'),
      (e: unknown) => e instanceof IdentityError && e.code === 'REFRESH_TOKEN_INVALID'
    )
  })
})

describe('IdentityService: RBAC', () => {
  test('assertRole passes when the role matches', () => {
    const identity = buildService()
    identity.assertRole({ role: 'customer' }, 'customer')
  })

  test('a customer session cannot satisfy an operator-only check', () => {
    const identity = buildService()
    assert.throws(
      () => identity.assertRole({ role: 'customer' }, 'operator'),
      (e: unknown) => e instanceof IdentityError && e.code === 'FORBIDDEN_ROLE'
    )
  })

  test('an operator session cannot satisfy a customer-only check', () => {
    const identity = buildService()
    assert.throws(
      () => identity.assertRole({ role: 'operator' }, 'customer'),
      (e: unknown) => e instanceof IdentityError && e.code === 'FORBIDDEN_ROLE'
    )
  })
})

describe('IdentityService: step-up authentication (FR-04)', () => {
  async function issuedSession(identity: IdentityService) {
    const { mfaSecret } = await seedCustomer(identity)
    const challenge = await identity.login('alice', 'correct horse battery staple')
    const session = await identity.verifyMfa(challenge.mfaToken, totpAt(mfaSecret))
    return { session, mfaSecret }
  }

  test('a risky action can demand step-up, verified with a TOTP code, without any of it happening at login', async () => {
    const identity = buildService()
    const { session, mfaSecret } = await issuedSession(identity)

    const actionChallenge = await identity.issueActionChallenge(session.accessToken, 'new_payee')
    assert.equal(actionChallenge.reason, 'new_payee')

    const stepUp = await identity.completeStepUp(actionChallenge.actionToken, 'new_payee', totpAt(mfaSecret))
    assert.ok(stepUp.stepUpToken)

    const result = await identity.verifyStepUpToken(stepUp.stepUpToken, 'new_payee')
    assert.ok(result)
  })

  test('a step-up token is single-use: verifying it twice fails the second time', async () => {
    const identity = buildService()
    const { session, mfaSecret } = await issuedSession(identity)

    const actionChallenge = await identity.issueActionChallenge(session.accessToken, 'over_limit')
    const stepUp = await identity.completeStepUp(actionChallenge.actionToken, 'over_limit', totpAt(mfaSecret))

    assert.ok(await identity.verifyStepUpToken(stepUp.stepUpToken, 'over_limit'))
    assert.equal(await identity.verifyStepUpToken(stepUp.stepUpToken, 'over_limit'), null)
  })

  test('an invalid access token cannot request a step-up challenge', async () => {
    const identity = buildService()
    await assert.rejects(
      () => identity.issueActionChallenge('not-a-real-token', 'new_payee'),
      (e: unknown) => e instanceof IdentityError && e.code === 'ACCESS_TOKEN_INVALID'
    )
  })

  test('a wrong TOTP code cannot complete step-up', async () => {
    const identity = buildService()
    const { session } = await issuedSession(identity)
    const actionChallenge = await identity.issueActionChallenge(session.accessToken, 'unrecognised_device')

    await assert.rejects(
      () => identity.completeStepUp(actionChallenge.actionToken, 'unrecognised_device', '000000'),
      (e: unknown) => e instanceof IdentityError && e.code === 'MFA_CODE_INVALID'
    )
  })
})

describe('IdentityService: FR-01 re-verification against the preserved registry', () => {
  test('a matching customer id and registry document verifies', async () => {
    const registryStore = new InMemoryRegistryStore()
    await registryStore.seed({ customerId: 'cust-alice', registryDocumentId: 'doc-001', fullName: 'Alice Perera' })
    const seededIdentity = buildService({ registryStore })

    const outcome = await seededIdentity.reVerify('cust-alice', 'doc-001')
    assert.equal(outcome.verified, true)
    assert.equal(outcome.livenessSimulated, true)
  })

  test('a non-matching pair does not verify, and liveness is still labelled simulated', async () => {
    const identity = buildService()
    const outcome = await identity.reVerify('cust-nobody', 'doc-999')
    assert.equal(outcome.verified, false)
    assert.equal(outcome.livenessSimulated, true)
  })
})

describe('IdentityService: FR-02 account opening with KYC upload', () => {
  test('opening without a KYC document on file is rejected', async () => {
    const identity = buildService()
    await assert.rejects(
      () =>
        identity.openAccount({
          fullName: 'New Customer',
          dateOfBirth: '2000-01-01',
          email: 'new@example.com',
          phone: '+94000000000',
          kycDocumentId: 'doc-missing',
        }),
      (e: unknown) => e instanceof IdentityError && e.code === 'KYC_DOCUMENT_NOT_FOUND'
    )
  })

  test('opening with a document provisions a real, visible account via AccountsService', async () => {
    const identity = buildService()
    const doc = await identity.uploadKycDocument('id-card.png', 'image/png', new Uint8Array([1, 2, 3]))

    const opened = await identity.openAccount({
      fullName: 'New Customer',
      dateOfBirth: '2000-01-01',
      email: 'new@example.com',
      phone: '+94000000000',
      kycDocumentId: doc.documentId,
    })

    assert.equal(opened.status, 'approved')
    assert.ok(opened.accountId.startsWith('customer:'))

    const persisted = await identity.getAccountOpening(opened.customerId)
    assert.deepEqual(persisted, opened)
  })
})
