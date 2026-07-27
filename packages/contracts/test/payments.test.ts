import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { transferRequest, agentCashRequest } from '../src/payments.ts'

describe('transferRequest', () => {
  const valid = {
    idempotencyKey: 'key-1',
    fromAccountId: 'acc-1',
    toAccountId: 'acc-2',
    amount: '500',
  }

  test('accepts a valid transfer', () => {
    const parsed = transferRequest.parse(valid)
    assert.equal(parsed.amount, 500n)
  })

  test('rejects a transfer with no idempotency key, the request cannot be made safely retryable', () => {
    const { idempotencyKey, ...withoutKey } = valid
    assert.throws(() => transferRequest.parse(withoutKey))
  })

  test('rejects a zero amount transfer', () => {
    assert.throws(() => transferRequest.parse({ ...valid, amount: '0' }))
  })
})

describe('agentCashRequest', () => {
  test('requires an OTP code, presence of the agent alone is not consent', () => {
    assert.throws(() =>
      agentCashRequest.parse({
        idempotencyKey: 'key-1',
        agentId: 'agent-1',
        customerId: 'cust-1',
        direction: 'cash_in',
        amount: '1000',
      }),
    )
  })

  test('accepts a full valid cash-out request', () => {
    const parsed = agentCashRequest.parse({
      idempotencyKey: 'key-1',
      agentId: 'agent-1',
      customerId: 'cust-1',
      direction: 'cash_out',
      amount: '1000',
      otpCode: '654321',
    })
    assert.equal(parsed.direction, 'cash_out')
  })
})
