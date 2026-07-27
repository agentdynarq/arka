import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { signQrPayload, verifyQrPayload } from '../src/qr.ts'
import { PaymentsError } from '../src/types.ts'

const KEY = 'signing-key-for-tests'

function payload(overrides: Partial<Parameters<typeof signQrPayload>[0]> = {}) {
  return {
    merchantAccountId: 'merchant:kade',
    amount: 50_00n,
    reference: 'order-123',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  }
}

describe('sign and verify round trip', () => {
  test('a freshly signed token verifies to the same payload', () => {
    const signed = signQrPayload(payload(), KEY)
    const recovered = verifyQrPayload(signed.token, KEY)

    assert.equal(recovered.merchantAccountId, 'merchant:kade')
    assert.equal(recovered.amount, 50_00n)
    assert.equal(recovered.reference, 'order-123')
  })

  test('amount survives as bigint, not a rounded number', () => {
    const huge = 9_007_199_254_740_993n // Number.MAX_SAFE_INTEGER + 2
    const signed = signQrPayload(payload({ amount: huge }), KEY)
    assert.equal(verifyQrPayload(signed.token, KEY).amount, huge)
  })

  test('an account id containing characters a naive delimiter would choke on round-trips cleanly', () => {
    const signed = signQrPayload(payload({ merchantAccountId: 'merchant:kade.branch-2 "west"' }), KEY)
    assert.equal(verifyQrPayload(signed.token, KEY).merchantAccountId, 'merchant:kade.branch-2 "west"')
  })
})

describe('tampering is detected', () => {
  test('a flipped amount is rejected', () => {
    const signed = signQrPayload(payload(), KEY)
    const [encoded, sig] = signed.token.split('.')
    const tamperedCanonical = Buffer.from(encoded!, 'base64url')
      .toString('utf8')
      .replace('"5000"', '"999999"')
    const tampered = Buffer.from(tamperedCanonical, 'utf8').toString('base64url') + '.' + sig

    assert.throws(
      () => verifyQrPayload(tampered, KEY),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_SIGNATURE_INVALID'
    )
  })

  test('a wrong signing key is rejected', () => {
    const signed = signQrPayload(payload(), KEY)
    assert.throws(
      () => verifyQrPayload(signed.token, 'a-different-key'),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_SIGNATURE_INVALID'
    )
  })

  test('a malformed token (wrong number of parts) is rejected', () => {
    assert.throws(
      () => verifyQrPayload('not-a-real-token', KEY),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_MALFORMED'
    )
  })

  test('a signature checked against a fabricated signature fails before JSON is ever parsed', () => {
    // Proves the ordering, not just the outcome: verification rejects this
    // on the signature check, the same discipline verifyWorkloadToken uses,
    // rather than reaching the JSON.parse branch and failing there instead.
    const garbage = Buffer.from('not json', 'utf8').toString('base64url') + '.somesignature'
    assert.throws(
      () => verifyQrPayload(garbage, KEY),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_SIGNATURE_INVALID'
    )
  })
})

describe('expiry', () => {
  test('an unexpired code verifies', () => {
    const signed = signQrPayload(payload({ expiresAt: new Date(Date.now() + 1000).toISOString() }), KEY)
    verifyQrPayload(signed.token, KEY) // does not throw
  })

  test('an expired code is rejected with QR_EXPIRED, not treated as tampered', () => {
    const signed = signQrPayload(payload({ expiresAt: new Date(Date.now() - 1000).toISOString() }), KEY)
    assert.throws(
      () => verifyQrPayload(signed.token, KEY),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_EXPIRED'
    )
  })

  test('an injectable clock makes expiry deterministic in tests', () => {
    const expiresAt = '2066-01-01T00:00:10.000Z'
    const signed = signQrPayload(payload({ expiresAt }), KEY)

    const beforeExpiry = () => new Date('2066-01-01T00:00:09.000Z')
    verifyQrPayload(signed.token, KEY, beforeExpiry) // does not throw

    const afterExpiry = () => new Date('2066-01-01T00:00:11.000Z')
    assert.throws(
      () => verifyQrPayload(signed.token, KEY, afterExpiry),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_EXPIRED'
    )
  })
})
