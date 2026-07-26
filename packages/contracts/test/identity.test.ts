import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  mfaVerifyRequest,
  reVerificationResult,
  accountOpeningRequest,
} from '../src/identity.ts'

describe('mfaVerifyRequest', () => {
  test('accepts a six digit code', () => {
    const parsed = mfaVerifyRequest.parse({ mfaToken: 't', totpCode: '123456' })
    assert.equal(parsed.totpCode, '123456')
  })

  test('rejects a code that is not six digits', () => {
    assert.throws(() => mfaVerifyRequest.parse({ mfaToken: 't', totpCode: '12345' }))
    assert.throws(() => mfaVerifyRequest.parse({ mfaToken: 't', totpCode: 'abcdef' }))
  })
})

describe('reVerificationResult', () => {
  test('livenessSimulated must be present and true, never silently omitted', () => {
    const parsed = reVerificationResult.parse({
      verified: true,
      livenessSimulated: true,
      checkedAt: '2026-07-27T00:00:00Z',
    })
    assert.equal(parsed.livenessSimulated, true)
  })

  test('rejects a response that claims the liveness check was real', () => {
    assert.throws(() =>
      reVerificationResult.parse({
        verified: true,
        livenessSimulated: false,
        checkedAt: '2026-07-27T00:00:00Z',
      }),
    )
  })
})

describe('accountOpeningRequest', () => {
  test('accepts a full valid application', () => {
    const parsed = accountOpeningRequest.parse({
      fullName: 'Alice Silva',
      dateOfBirth: '1990-01-01',
      email: 'alice@example.com',
      phone: '+94770000000',
      kycDocumentId: 'doc-1',
    })
    assert.equal(parsed.fullName, 'Alice Silva')
  })

  test('rejects a malformed email', () => {
    assert.throws(() =>
      accountOpeningRequest.parse({
        fullName: 'Alice Silva',
        dateOfBirth: '1990-01-01',
        email: 'not-an-email',
        phone: '+94770000000',
        kycDocumentId: 'doc-1',
      }),
    )
  })
})
