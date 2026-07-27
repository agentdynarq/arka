import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { LedgerService, InMemoryLedgerStore } from '@arka/ledger'
import { AccountsService, InMemoryAccountRegistry } from '@arka/accounts'

import { PaymentsService } from '../src/service.ts'
import { InMemoryIdempotencyStore } from '../src/memory-idempotency-store.ts'
import { InMemoryLimitsStore } from '../src/memory-limits-store.ts'
import { InMemoryAgentCashStore } from '../src/memory-agent-cash-store.ts'
import { PaymentsError } from '../src/types.ts'
import type { TransferResult } from '../src/types.ts'

const TEST_QR_SIGNING_KEY = 'test-qr-signing-key'

async function newFundedPayments(
  options: { idempotencyWaitMs?: number; defaultDailyLimit?: bigint; agentCashTtlSeconds?: number; now?: () => Date } = {}
): Promise<{
  payments: PaymentsService
  ledger: LedgerService
  accounts: AccountsService
  limits: InMemoryLimitsStore
  agentCash: InMemoryAgentCashStore
}> {
  const ledger = new LedgerService(new InMemoryLedgerStore(), { cellId: 'cell-1' })
  const accounts = new AccountsService({ registry: new InMemoryAccountRegistry(), ledger })
  await accounts.open('customer:alice', 'cust-1', 'Alice Perera')
  await accounts.open('customer:bob', 'cust-2', 'Bob Silva')
  await accounts.open('agent:west', 'cust-agent-west', 'West Branch Agent')
  await ledger.record([
    { account: 'bank:reserve', direction: 'debit', amount: 1_000_00n },
    { account: 'customer:alice', direction: 'credit', amount: 1_000_00n },
  ])
  await ledger.record([
    { account: 'bank:reserve', direction: 'debit', amount: 1_000_00n },
    { account: 'agent:west', direction: 'credit', amount: 1_000_00n },
  ])

  const limits = new InMemoryLimitsStore()
  const agentCash = new InMemoryAgentCashStore()
  const payments = new PaymentsService({
    accounts,
    ledger,
    idempotency: new InMemoryIdempotencyStore<TransferResult>(),
    limits,
    agentCash,
    qrSigningKey: TEST_QR_SIGNING_KEY,
    ...(options.idempotencyWaitMs !== undefined ? { idempotencyWaitMs: options.idempotencyWaitMs } : {}),
    ...(options.defaultDailyLimit !== undefined ? { defaultDailyLimit: options.defaultDailyLimit } : {}),
    ...(options.agentCashTtlSeconds !== undefined ? { agentCashTtlSeconds: options.agentCashTtlSeconds } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
  })
  return { payments, ledger, accounts, limits, agentCash }
}

describe('transfer', () => {
  test('moves money and returns a confirmed result', async () => {
    const { payments, accounts } = await newFundedPayments()

    const result = await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 125_00n,
    })

    assert.equal(result.status, 'confirmed')
    assert.equal((await accounts.summary('customer:alice')).balance, 875_00n)
    assert.equal((await accounts.summary('customer:bob')).balance, 125_00n)
  })

  test('rejects a transfer to the same account', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-1',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:alice',
          amount: 1n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'SAME_ACCOUNT'
    )
  })

  test('rejects a transfer beyond the sender balance, and moves nothing', async () => {
    const { payments, accounts } = await newFundedPayments()

    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-1',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:bob',
          amount: 1_000_01n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'INSUFFICIENT_FUNDS'
    )
    assert.equal((await accounts.summary('customer:alice')).balance, 1_000_00n)
    assert.equal((await accounts.summary('customer:bob')).balance, 0n)
  })

  test('an unknown account surfaces as AccountsError, not a silent transfer', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(() =>
      payments.transfer({
        idempotencyKey: 'req-1',
        fromAccountId: 'customer:alice',
        toAccountId: 'customer:nobody',
        amount: 1n,
      })
    )
  })
})

describe('isNewPayee (FR-04 trigger)', () => {
  test('a payee never transferred to is new', async () => {
    const { payments } = await newFundedPayments()
    assert.equal(await payments.isNewPayee('customer:alice', 'customer:bob'), true)
  })

  test('a payee already paid at least once is not new', async () => {
    const { payments } = await newFundedPayments()
    await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 10_00n,
    })
    assert.equal(await payments.isNewPayee('customer:alice', 'customer:bob'), false)
  })

  test('receiving money from an account does not count as having paid them', async () => {
    const { payments } = await newFundedPayments()
    // The opening deposit credits alice from bank:reserve; alice has never
    // sent bank:reserve anything, so it must still read as a new payee.
    assert.equal(await payments.isNewPayee('customer:alice', 'bank:reserve'), true)
  })
})

describe('idempotency (FR-13)', () => {
  test('the identical request retried sequentially returns the same result and moves money once', async () => {
    const { payments, accounts, ledger } = await newFundedPayments()
    const request = {
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 125_00n,
    }

    const first = await payments.transfer(request)
    const second = await payments.transfer(request)

    assert.equal(first.transferId, second.transferId)
    assert.equal((await accounts.summary('customer:bob')).balance, 125_00n, 'not 250.00')
    assert.equal(await ledger.count(), 3, 'two opening deposit blocks (alice, agent:west), one transfer block')
  })

  test('the same key fired concurrently transfers money exactly once', async () => {
    const { payments, accounts, ledger } = await newFundedPayments()
    const request = {
      idempotencyKey: 'req-concurrent',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 100_00n,
    }

    const [a, b] = await Promise.all([payments.transfer(request), payments.transfer(request)])

    assert.equal(a.transferId, b.transferId, 'both callers must see the same outcome')
    assert.equal((await accounts.summary('customer:bob')).balance, 100_00n, 'not 200.00')
    assert.equal(await ledger.count(), 3, 'two opening deposit blocks (alice, agent:west), exactly one transfer block')
  })

  test('reusing a key with a different amount is rejected, not silently replayed', async () => {
    const { payments } = await newFundedPayments()
    await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 50_00n,
    })

    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-1',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:bob',
          amount: 999_00n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
    )
  })

  test('reusing a key with a different destination account is rejected', async () => {
    const { payments, accounts } = await newFundedPayments()
    await accounts.open('customer:carol', 'cust-3', 'Carol Fernando')

    await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 50_00n,
    })

    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-1',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:carol',
          amount: 50_00n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST'
    )
  })

  test('a failed attempt releases the key, so an identical retry actually re-executes', async () => {
    const { payments } = await newFundedPayments()
    const request = {
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 1_000_01n, // more than the funded balance
    }

    await assert.rejects(
      () => payments.transfer(request),
      (e: unknown) => e instanceof PaymentsError && e.code === 'INSUFFICIENT_FUNDS'
    )

    // Same key, same request: must attempt again, not return a cached failure
    // or silently succeed. It fails again for the same real reason.
    await assert.rejects(
      () => payments.transfer(request),
      (e: unknown) => e instanceof PaymentsError && e.code === 'INSUFFICIENT_FUNDS'
    )
  })

  test('a concurrent caller times out rather than waiting forever for a claim that never completes', async () => {
    const { accounts, ledger } = await newFundedPayments()
    const store = new InMemoryIdempotencyStore<TransferResult>()

    const request = {
      idempotencyKey: 'stuck-key',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 10_00n,
    }

    // Claim the key directly, bypassing PaymentsService entirely, so it is
    // permanently stuck in 'pending'. Simulates a claimant that crashed
    // mid-flight rather than one that is merely slow.
    await store.reserve(
      request.idempotencyKey,
      JSON.stringify([request.fromAccountId, request.toAccountId, request.amount.toString()])
    )

    const payments = new PaymentsService({
      accounts,
      ledger,
      idempotency: store,
      limits: new InMemoryLimitsStore(),
      agentCash: new InMemoryAgentCashStore(),
      qrSigningKey: TEST_QR_SIGNING_KEY,
      idempotencyWaitMs: 60,
    })

    await assert.rejects(
      () => payments.transfer(request),
      (e: unknown) => e instanceof PaymentsError && e.code === 'IDEMPOTENCY_TIMEOUT'
    )
  })
})

describe('daily limits (FR-12)', () => {
  test('an account with no override reads back the platform default', async () => {
    const { payments } = await newFundedPayments({ defaultDailyLimit: 200_00n })
    const info = await payments.dailyLimit('customer:alice')

    assert.equal(info.limit, 200_00n)
    assert.equal(info.spentToday, 0n)
  })

  test('spentToday sums today\'s outgoing transfers, sourced live from the ledger', async () => {
    const { payments } = await newFundedPayments()
    await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 100_00n,
    })
    await payments.transfer({
      idempotencyKey: 'req-2',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 50_00n,
    })

    assert.equal((await payments.dailyLimit('customer:alice')).spentToday, 150_00n)
    // Bob only ever received money today; his outgoing spend is zero.
    assert.equal((await payments.dailyLimit('customer:bob')).spentToday, 0n)
  })

  test('spentToday only counts today, not a transfer from a previous day', async () => {
    const yesterday = () => new Date('2065-12-31T12:00:00.000Z')
    const today = () => new Date('2066-01-01T12:00:00.000Z')

    const { payments, ledger } = await newFundedPayments({ now: today })
    // Record a transfer with yesterday's timestamp directly through the
    // ledger, simulating a payment made on a prior calendar day.
    await ledger.record(
      [
        { account: 'customer:alice', direction: 'debit', amount: 40_00n },
        { account: 'customer:bob', direction: 'credit', amount: 40_00n },
      ],
      yesterday().toISOString()
    )

    assert.equal((await payments.dailyLimit('customer:alice')).spentToday, 0n)
  })

  test('a transfer within the limit succeeds', async () => {
    const { payments } = await newFundedPayments({ defaultDailyLimit: 200_00n })
    const result = await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 150_00n,
    })
    assert.equal(result.status, 'confirmed')
  })

  test('a transfer that would exceed the daily limit is rejected, and moves nothing', async () => {
    const { payments, accounts } = await newFundedPayments({ defaultDailyLimit: 200_00n })

    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-1',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:bob',
          amount: 201_00n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'DAILY_LIMIT_EXCEEDED'
    )
    assert.equal((await accounts.summary('customer:bob')).balance, 0n)
  })

  test('two transfers that individually fit but together exceed the limit: the second is rejected', async () => {
    const { payments } = await newFundedPayments({ defaultDailyLimit: 200_00n })
    await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 150_00n,
    })

    await assert.rejects(
      () =>
        payments.transfer({
          idempotencyKey: 'req-2',
          fromAccountId: 'customer:alice',
          toAccountId: 'customer:bob',
          amount: 100_00n, // 150 + 100 = 250, over the 200 limit
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'DAILY_LIMIT_EXCEEDED'
    )
  })

  test('changing a limit without a verified step-up is rejected', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(
      () => payments.changeDailyLimit({ accountId: 'customer:alice', newLimit: 300_00n, stepUpVerified: false }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'STEP_UP_REQUIRED'
    )
  })

  test('changing a limit with a verified step-up takes effect', async () => {
    const { payments } = await newFundedPayments({ defaultDailyLimit: 100_00n })
    const updated = await payments.changeDailyLimit({
      accountId: 'customer:alice',
      newLimit: 300_00n,
      stepUpVerified: true,
    })
    assert.equal(updated.limit, 300_00n)

    // Now spendable beyond what the old 100.00 default would have allowed.
    const result = await payments.transfer({
      idempotencyKey: 'req-1',
      fromAccountId: 'customer:alice',
      toAccountId: 'customer:bob',
      amount: 250_00n,
    })
    assert.equal(result.status, 'confirmed')
  })

  test('rejects a non-positive new limit even with a verified step-up', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(
      () => payments.changeDailyLimit({ accountId: 'customer:alice', newLimit: 0n, stepUpVerified: true }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'INVALID_LIMIT'
    )
  })
})

describe('QR acceptance (FR-11)', () => {
  test('generating a QR payload is synchronous: no I/O, not even an account lookup', async () => {
    const { payments } = await newFundedPayments()

    // Deliberately not awaited: generateQrPayload does not return a Promise,
    // so a merchant app can render a QR code without a round trip.
    const signed = payments.generateQrPayload({
      merchantAccountId: 'merchant:kade',
      amount: 75_00n,
      reference: 'order-1',
      ttlSeconds: 300,
    })

    assert.ok(signed.token.length > 0)
    assert.equal(signed.payload.amount, 75_00n)
  })

  test('redeeming a valid QR code transfers from customer to merchant', async () => {
    const { payments, accounts } = await newFundedPayments()
    await accounts.open('merchant:kade', 'cust-merchant', 'Kade Stores')

    const { token } = payments.generateQrPayload({
      merchantAccountId: 'merchant:kade',
      amount: 75_00n,
      reference: 'order-1',
      ttlSeconds: 300,
    })

    const result = await payments.redeemQr({ idempotencyKey: 'redeem-1', customerAccountId: 'customer:alice', qrToken: token })

    assert.equal(result.status, 'confirmed')
    assert.equal((await accounts.summary('merchant:kade')).balance, 75_00n)
    assert.equal((await accounts.summary('customer:alice')).balance, 925_00n)
  })

  test('redeeming the same QR code twice with the same idempotency key moves money once', async () => {
    const { payments, accounts } = await newFundedPayments()
    await accounts.open('merchant:kade', 'cust-merchant', 'Kade Stores')

    const { token } = payments.generateQrPayload({
      merchantAccountId: 'merchant:kade',
      amount: 75_00n,
      reference: 'order-1',
      ttlSeconds: 300,
    })
    const request = { idempotencyKey: 'redeem-1', customerAccountId: 'customer:alice', qrToken: token }

    const [a, b] = await Promise.all([payments.redeemQr(request), payments.redeemQr(request)])

    assert.equal(a.transferId, b.transferId)
    assert.equal((await accounts.summary('merchant:kade')).balance, 75_00n, 'not 150.00')
  })

  test('redeeming an expired QR code fails without touching any balance', async () => {
    const { payments, accounts } = await newFundedPayments()
    await accounts.open('merchant:kade', 'cust-merchant', 'Kade Stores')

    const { token } = payments.generateQrPayload({
      merchantAccountId: 'merchant:kade',
      amount: 75_00n,
      reference: 'order-1',
      ttlSeconds: -1, // already expired
    })

    await assert.rejects(
      () => payments.redeemQr({ idempotencyKey: 'redeem-1', customerAccountId: 'customer:alice', qrToken: token }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'QR_EXPIRED'
    )
    assert.equal((await accounts.summary('merchant:kade')).balance, 0n)
  })

  test('a QR redemption is still subject to the same daily limit as a direct transfer', async () => {
    const { payments, accounts } = await newFundedPayments({ defaultDailyLimit: 50_00n })
    await accounts.open('merchant:kade', 'cust-merchant', 'Kade Stores')

    const { token } = payments.generateQrPayload({
      merchantAccountId: 'merchant:kade',
      amount: 75_00n,
      reference: 'order-1',
      ttlSeconds: 300,
    })

    await assert.rejects(
      () => payments.redeemQr({ idempotencyKey: 'redeem-1', customerAccountId: 'customer:alice', qrToken: token }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'DAILY_LIMIT_EXCEEDED'
    )
  })
})

describe('agent cash-in and cash-out (FR-16)', () => {
  test('cash-in credits the customer, debits the agent', async () => {
    const { payments, accounts } = await newFundedPayments()
    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:bob',
      direction: 'cash_in',
      amount: 200_00n,
    })

    const result = await payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode })

    assert.equal(result.status, 'confirmed')
    assert.equal((await accounts.summary('customer:bob')).balance, 200_00n)
    assert.equal((await accounts.summary('agent:west')).balance, 800_00n, '1000.00 minus the 200.00 handed to bob')
  })

  test('cash-out debits the customer, credits the agent', async () => {
    const { payments, accounts } = await newFundedPayments()
    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:alice',
      direction: 'cash_out',
      amount: 200_00n,
    })

    await payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode })

    assert.equal((await accounts.summary('customer:alice')).balance, 800_00n)
    assert.equal((await accounts.summary('agent:west')).balance, 1_200_00n)
  })

  test('the OTP is never delivered by this service, only returned to the caller', async () => {
    const { payments } = await newFundedPayments()
    const result = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:bob',
      direction: 'cash_in',
      amount: 10_00n,
    })
    assert.match(result.otpCode, /^\d{6}$/)
  })

  test('rejects the agent and customer being the same account', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(
      () =>
        payments.requestAgentCash({
          agentId: 'agent-1',
          agentAccountId: 'customer:alice',
          customerAccountId: 'customer:alice',
          direction: 'cash_in',
          amount: 10_00n,
        }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'SAME_ACCOUNT'
    )
  })

  test('rejects a wrong OTP without consuming the request, a retry with the right one still works', async () => {
    const { payments, accounts } = await newFundedPayments()
    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:bob',
      direction: 'cash_in',
      amount: 50_00n,
    })

    const wrongCode = otpCode === '000000' ? '111111' : '000000'
    await assert.rejects(
      () => payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode: wrongCode }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'AGENT_OTP_INVALID'
    )

    const result = await payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode })
    assert.equal(result.status, 'confirmed')
    assert.equal((await accounts.summary('customer:bob')).balance, 50_00n)
  })

  test('rejects completing the same request twice, even with the correct OTP', async () => {
    const { payments } = await newFundedPayments()
    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:bob',
      direction: 'cash_in',
      amount: 10_00n,
    })

    await payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode })
    await assert.rejects(
      () => payments.completeAgentCash({ idempotencyKey: 'complete-2', requestId, otpCode }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'AGENT_REQUEST_ALREADY_USED'
    )
  })

  test('rejects an unknown request id', async () => {
    const { payments } = await newFundedPayments()
    await assert.rejects(
      () => payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId: 'nonexistent', otpCode: '123456' }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'AGENT_REQUEST_NOT_FOUND'
    )
  })

  test('rejects an expired request', async () => {
    let now = () => new Date('2066-01-01T00:00:00.000Z')
    const { payments } = await newFundedPayments({ agentCashTtlSeconds: 60, now: () => now() })

    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:bob',
      direction: 'cash_in',
      amount: 10_00n,
    })

    now = () => new Date('2066-01-01T00:01:01.000Z') // 61 seconds later, past the 60-second TTL
    await assert.rejects(
      () => payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'AGENT_REQUEST_EXPIRED'
    )
  })

  test('completing an agent cash request is subject to the same daily limit as a direct transfer', async () => {
    const { payments } = await newFundedPayments({ defaultDailyLimit: 50_00n })
    const { requestId, otpCode } = await payments.requestAgentCash({
      agentId: 'agent-1',
      agentAccountId: 'agent:west',
      customerAccountId: 'customer:alice',
      direction: 'cash_out',
      amount: 75_00n,
    })

    await assert.rejects(
      () => payments.completeAgentCash({ idempotencyKey: 'complete-1', requestId, otpCode }),
      (e: unknown) => e instanceof PaymentsError && e.code === 'DAILY_LIMIT_EXCEEDED'
    )
  })

  test(
    'genuinely concurrent completion with two different idempotency keys still moves money exactly once: ' +
      'the loser gets AGENT_REQUEST_ALREADY_USED, not a second real transfer',
    async () => {
      const { payments, accounts, agentCash } = await newFundedPayments()
      const { requestId, otpCode } = await payments.requestAgentCash({
        agentId: 'agent-1',
        agentAccountId: 'agent:west',
        customerAccountId: 'customer:bob',
        direction: 'cash_in',
        amount: 30_00n,
      })

      // Different idempotency keys, deliberately: a same-key race would only
      // prove transfer()'s already-tested idempotency, not that
      // completeAgentCash's own OTP-consumption step is exclusive. This is
      // what a genuine double-submit (two different agent devices, or a
      // naive retry that generates a fresh key) actually looks like.
      const results = await Promise.allSettled([
        payments.completeAgentCash({ idempotencyKey: 'complete-a', requestId, otpCode }),
        payments.completeAgentCash({ idempotencyKey: 'complete-b', requestId, otpCode }),
      ])

      const fulfilled = results.filter((r) => r.status === 'fulfilled')
      const rejected = results.filter((r) => r.status === 'rejected')
      assert.equal(fulfilled.length, 1, 'exactly one concurrent completion should win')
      assert.equal(rejected.length, 1)
      assert.ok(
        (rejected[0] as PromiseRejectedResult).reason instanceof PaymentsError &&
          (rejected[0] as PromiseRejectedResult).reason.code === 'AGENT_REQUEST_ALREADY_USED',
        'the loser must fail closed, not silently execute a second real transfer'
      )
      assert.equal((await accounts.summary('customer:bob')).balance, 30_00n, 'not 60.00')
      assert.equal(await agentCash.get(requestId).then((r) => r?.consumedAt !== null), true)
    }
  )
})
