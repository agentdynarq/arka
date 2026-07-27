import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { issueWorkloadToken, verifyWorkloadToken } from '../src/token.ts'
import { WorkloadAuthError } from '../src/types.ts'

const KEY = 'cell-1-signing-key'

describe('issue and verify round trip', () => {
  test('a freshly issued token verifies and carries the right claims', () => {
    const token = issueWorkloadToken({
      subject: 'payments',
      cellId: 'cell-1',
      signingKey: KEY,
      ttlSeconds: 60,
    })
    const identity = verifyWorkloadToken(token, KEY)
    assert.equal(identity.subject, 'payments')
    assert.equal(identity.cellId, 'cell-1')
  })

  test('two tokens for the same subject carry different nonces', () => {
    const a = issueWorkloadToken({ subject: 'payments', cellId: 'cell-1', signingKey: KEY, ttlSeconds: 60 })
    const b = issueWorkloadToken({ subject: 'payments', cellId: 'cell-1', signingKey: KEY, ttlSeconds: 60 })
    assert.notEqual(verifyWorkloadToken(a, KEY).nonce, verifyWorkloadToken(b, KEY).nonce)
  })
})

describe('expiry', () => {
  test('a token verifies while still within its ttl', () => {
    let clock = 1_000
    const token = issueWorkloadToken({
      subject: 'ledger',
      cellId: 'cell-2',
      signingKey: KEY,
      ttlSeconds: 30,
      now: () => clock,
    })
    clock += 29
    assert.doesNotThrow(() => verifyWorkloadToken(token, KEY, { now: () => clock }))
  })

  test('a token is rejected once its ttl has elapsed', () => {
    let clock = 1_000
    const token = issueWorkloadToken({
      subject: 'ledger',
      cellId: 'cell-2',
      signingKey: KEY,
      ttlSeconds: 30,
      now: () => clock,
    })
    clock += 31
    assert.throws(
      () => verifyWorkloadToken(token, KEY, { now: () => clock }),
      (error: unknown) => error instanceof WorkloadAuthError && error.code === 'EXPIRED',
    )
  })

  test('rejects a non-positive ttl at issue time', () => {
    assert.throws(() =>
      issueWorkloadToken({ subject: 'ledger', cellId: 'cell-2', signingKey: KEY, ttlSeconds: 0 }),
    )
  })
})

describe('tampering', () => {
  test('rejects a token verified with the wrong signing key', () => {
    const token = issueWorkloadToken({ subject: 'accounts', cellId: 'cell-1', signingKey: KEY, ttlSeconds: 60 })
    assert.throws(
      () => verifyWorkloadToken(token, 'a-different-key'),
      (error: unknown) => error instanceof WorkloadAuthError && error.code === 'BAD_SIGNATURE',
    )
  })

  test('rejects a token whose payload was altered after issue', () => {
    const token = issueWorkloadToken({ subject: 'accounts', cellId: 'cell-1', signingKey: KEY, ttlSeconds: 60 })
    const [header, payload, signature] = token.split('.')
    const tampered = `${header}.${payload}x.${signature}`
    assert.throws(
      () => verifyWorkloadToken(tampered, KEY),
      (error: unknown) => error instanceof WorkloadAuthError && error.code === 'BAD_SIGNATURE',
    )
  })

  test('rejects a token that does not have three parts', () => {
    assert.throws(
      () => verifyWorkloadToken('not-a-real-token', KEY),
      (error: unknown) => error instanceof WorkloadAuthError && error.code === 'MALFORMED',
    )
  })
})
