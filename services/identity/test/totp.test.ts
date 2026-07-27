import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { generateTotpSecret, totpAt, verifyTotp } from '../src/totp.ts'

describe('TOTP', () => {
  test('generates a base32 secret with no padding', () => {
    const secret = generateTotpSecret()
    assert.match(secret, /^[A-Z2-7]+$/)
    assert.ok(secret.length >= 16)
  })

  test('the current code verifies', () => {
    const secret = generateTotpSecret()
    const code = totpAt(secret)
    assert.equal(verifyTotp(secret, code), true)
  })

  test('a code from a different secret does not verify', () => {
    const secretA = generateTotpSecret()
    const secretB = generateTotpSecret()
    const code = totpAt(secretA)
    assert.equal(verifyTotp(secretB, code), false)
  })

  test('a code one step in the past still verifies (clock drift tolerance)', () => {
    const secret = generateTotpSecret()
    const thirtySecondsAgo = Date.now() - 30_000
    const code = totpAt(secret, thirtySecondsAgo)
    assert.equal(verifyTotp(secret, code), true)
  })

  test('a code three steps away does not verify', () => {
    const secret = generateTotpSecret()
    const longAgo = Date.now() - 3 * 30_000
    const code = totpAt(secret, longAgo)
    assert.equal(verifyTotp(secret, code), false)
  })

  test('rejects malformed input rather than throwing', () => {
    const secret = generateTotpSecret()
    assert.equal(verifyTotp(secret, 'abcdef'), false)
    assert.equal(verifyTotp(secret, '123'), false)
  })

  test('is deterministic for the same secret and time step', () => {
    const secret = generateTotpSecret()
    const now = Date.now()
    assert.equal(totpAt(secret, now), totpAt(secret, now))
  })
})
