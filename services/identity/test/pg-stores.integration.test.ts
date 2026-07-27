/**
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 *
 * Every identity store shares one `identity` schema (`src/schema.sql`), so
 * every store's Postgres tests live in this one file rather than one file
 * per store: `resetSchema` drops and recreates the whole schema, and running
 * that concurrently from more than one test file racing against the same
 * schema name is exactly the kind of collision this file exists to avoid.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { isPostgresReachable } from '@arka/ledger'

import { PgUserStore } from '../src/pg-user-store.ts'
import { PgSessionStore } from '../src/pg-session-store.ts'
import { PgRateLimiter } from '../src/pg-rate-limiter.ts'
import { PgRegistryStore } from '../src/pg-registry-store.ts'
import { PgKycDocumentStore } from '../src/pg-kyc-store.ts'
import { PgAccountOpeningStore } from '../src/pg-account-opening-store.ts'
import { IdentityError } from '../src/types.ts'
import type { CustomerRecord } from '../src/types.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

function user(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    userId: 'user-alice',
    username: 'alice',
    passwordHash: '$argon2id$v=19$m=1,t=1,p=1$c2FsdA$aGFzaA',
    role: 'customer',
    customerId: 'cust-alice',
    mfaSecret: 'JBSWY3DPEHPK3PXP',
    failedLoginCount: 0,
    lockedUntil: null,
    createdAt: '2066-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const reachable = await isPostgresReachable(CONNECTION_STRING)
const skip = reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first`

describe('Identity Postgres stores, against a real Postgres', { skip }, () => {
  let userStore: PgUserStore
  let sessionStore: PgSessionStore
  let rateLimiter: PgRateLimiter
  let registryStore: PgRegistryStore
  let kycStore: PgKycDocumentStore
  let accountOpenings: PgAccountOpeningStore

  before(async () => {
    userStore = new PgUserStore(CONNECTION_STRING)
    await userStore.resetSchema()
    sessionStore = new PgSessionStore(CONNECTION_STRING)
    rateLimiter = new PgRateLimiter(CONNECTION_STRING)
    registryStore = new PgRegistryStore(CONNECTION_STRING)
    kycStore = new PgKycDocumentStore(CONNECTION_STRING)
    accountOpenings = new PgAccountOpeningStore(CONNECTION_STRING)
  })

  after(async () => {
    await userStore.close()
    await sessionStore.close()
    await rateLimiter.close()
    await registryStore.close()
    await kycStore.close()
    await accountOpenings.close()
  })

  describe('PgUserStore', () => {
    test('creates and reads back a user unchanged', async () => {
      await userStore.create(user())
      assert.deepEqual(await userStore.getByUsername('alice'), user())
      assert.deepEqual(await userStore.getById('user-alice'), user())
    })

    test('an unknown username or id is null, not an error', async () => {
      assert.equal(await userStore.getByUsername('nobody'), null)
      assert.equal(await userStore.getById('user-nobody'), null)
    })

    test('rejects creating the same username twice', async () => {
      await assert.rejects(
        () => userStore.create(user({ userId: 'user-alice-2' })),
        (e: unknown) => e instanceof IdentityError && e.code === 'USERNAME_ALREADY_EXISTS'
      )
    })

    test('increments failed logins atomically and resets them', async () => {
      await userStore.create(user({ userId: 'user-bob', username: 'bob' }))

      assert.equal(await userStore.incrementFailedLogins('user-bob'), 1)
      assert.equal(await userStore.incrementFailedLogins('user-bob'), 2)

      await userStore.resetFailedLogins('user-bob')
      assert.equal((await userStore.getById('user-bob'))?.failedLoginCount, 0)
    })

    test('sets and clears lockout', async () => {
      await userStore.create(user({ userId: 'user-chandi', username: 'chandi' }))
      const lockedUntil = '2066-06-01T00:00:00.000Z'

      await userStore.setLockedUntil('user-chandi', lockedUntil)
      assert.equal((await userStore.getById('user-chandi'))?.lockedUntil, lockedUntil)

      await userStore.setLockedUntil('user-chandi', null)
      assert.equal((await userStore.getById('user-chandi'))?.lockedUntil, null)
    })

    test('ten concurrent failed-login increments against the same user all land, none lost to a race', async () => {
      await userStore.create(user({ userId: 'user-deepal', username: 'deepal' }))
      await Promise.all(Array.from({ length: 10 }, () => userStore.incrementFailedLogins('user-deepal')))
      assert.equal((await userStore.getById('user-deepal'))?.failedLoginCount, 10)
    })
  })

  describe('PgSessionStore', () => {
    test('creates a family and reads it back', async () => {
      const familyId = await sessionStore.createFamily('user-alice', 'customer')
      const family = await sessionStore.getFamily(familyId)
      assert.equal(family?.userId, 'user-alice')
      assert.equal(family?.role, 'customer')
      assert.equal(family?.revoked, false)
    })

    test('an unknown family is null, not an error', async () => {
      assert.equal(await sessionStore.getFamily('not-a-real-family'), null)
    })

    test('claiming a fresh refresh token succeeds exactly once', async () => {
      const familyId = await sessionStore.createFamily('user-bob', 'customer')
      const tokenHash = randomUUID()
      await sessionStore.insertRefreshToken({
        tokenHash,
        familyId,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })

      const first = await sessionStore.claimRefreshToken(tokenHash)
      assert.equal(first.claimed, true)

      const second = await sessionStore.claimRefreshToken(tokenHash)
      assert.equal(second.claimed, false)
      if (!second.claimed) {
        assert.ok(second.existing)
        assert.equal(second.existing.familyId, familyId)
      }
    })

    test('claiming an unknown token hash reports no existing row', async () => {
      const outcome = await sessionStore.claimRefreshToken('never-inserted')
      assert.equal(outcome.claimed, false)
      if (!outcome.claimed) assert.equal(outcome.existing, null)
    })

    test('revoking a family is visible on the next read', async () => {
      const familyId = await sessionStore.createFamily('user-chandi', 'customer')
      await sessionStore.revokeFamily(familyId)
      assert.equal((await sessionStore.getFamily(familyId))?.revoked, true)
    })

    test(
      'a genuinely concurrent double-claim of the same refresh token, fired with Promise.all against a real ' +
        'database, still lets exactly one caller win',
      async () => {
        const familyId = await sessionStore.createFamily('user-deepal', 'customer')
        const tokenHash = randomUUID()
        await sessionStore.insertRefreshToken({
          tokenHash,
          familyId,
          usedAt: null,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        })

        const outcomes = await Promise.all(Array.from({ length: 10 }, () => sessionStore.claimRefreshToken(tokenHash)))
        assert.equal(outcomes.filter((o) => o.claimed).length, 1, 'exactly one of ten concurrent claims must win')
        assert.equal(outcomes.filter((o) => !o.claimed).length, 9)
      }
    )

    test('access tokens round-trip and an unknown one is null', async () => {
      const familyId = await sessionStore.createFamily('user-erandi', 'operator')
      const tokenHash = randomUUID()
      await sessionStore.insertAccessToken({
        tokenHash,
        familyId,
        userId: 'user-erandi',
        role: 'operator',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      })

      const row = await sessionStore.getAccessToken(tokenHash)
      assert.equal(row?.userId, 'user-erandi')
      assert.equal(row?.role, 'operator')
      assert.equal(await sessionStore.getAccessToken('never-inserted'), null)
    })
  })

  describe('PgRateLimiter', () => {
    test('a burst within the limit is allowed, then the next hit is refused', async () => {
      const key = 'login:burst-test'
      for (let i = 0; i < 5; i++) {
        assert.equal((await rateLimiter.hit(key, 5, 60_000)).allowed, true, `hit ${i + 1} of 5 should be allowed`)
      }
      const sixth = await rateLimiter.hit(key, 5, 60_000)
      assert.equal(sixth.allowed, false)
      assert.ok(sixth.retryAfterMs && sixth.retryAfterMs > 0)
    })

    test('twenty genuinely concurrent hits against a real database land exactly twenty counts, none lost', async () => {
      const key = 'login:concurrent-test'
      const outcomes = await Promise.all(Array.from({ length: 20 }, () => rateLimiter.hit(key, 1000, 60_000)))
      assert.equal(outcomes.filter((o) => o.allowed).length, 20)
    })
  })

  describe('PgRegistryStore (FR-01)', () => {
    test('a seeded registry entry is found by its exact pair', async () => {
      await registryStore.seed({ customerId: 'cust-alice', registryDocumentId: 'doc-001', fullName: 'Alice Perera' })
      assert.equal((await registryStore.find('cust-alice', 'doc-001'))?.fullName, 'Alice Perera')
    })

    test('a non-matching pair is null', async () => {
      assert.equal(await registryStore.find('cust-alice', 'doc-wrong'), null)
      assert.equal(await registryStore.find('cust-nobody', 'doc-001'), null)
    })
  })

  describe('PgKycDocumentStore (FR-02)', () => {
    test('a KYC document round-trips its bytes exactly', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4, 250, 251, 252])
      await kycStore.save({
        documentId: 'doc-kyc-1',
        filename: 'passport.png',
        mimeType: 'image/png',
        sizeBytes: bytes.byteLength,
        uploadedAt: '2066-01-01T00:00:00.000Z',
        bytes,
      })

      const loaded = await kycStore.get('doc-kyc-1')
      assert.equal(loaded?.filename, 'passport.png')
      assert.equal(loaded?.mimeType, 'image/png')
      assert.deepEqual(loaded ? [...loaded.bytes] : null, [...bytes])
    })

    test('an unknown document id is null', async () => {
      assert.equal(await kycStore.get('doc-does-not-exist'), null)
    })
  })

  describe('PgAccountOpeningStore (FR-02)', () => {
    test('an account-opening record round-trips through Postgres', async () => {
      const record = {
        customerId: 'cust-test-1',
        accountId: 'customer:cust-test-1',
        fullName: 'Test Customer',
        dateOfBirth: '2000-01-01',
        email: 'test@example.com',
        phone: '+94000000000',
        kycDocumentId: 'doc-1',
        status: 'approved' as const,
        openedAt: '2066-01-01T00:00:00.000Z',
      }
      await accountOpenings.save(record)
      assert.deepEqual(await accountOpenings.get('cust-test-1'), record)
    })

    test('an unknown customer id is null', async () => {
      assert.equal(await accountOpenings.get('cust-does-not-exist'), null)
    })
  })
})
