import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { LedgerService, InMemoryLedgerStore } from '@arka/ledger'
import { AccountsService, InMemoryAccountRegistry } from '@arka/accounts'

import { PaymentsService } from '../src/service.ts'
import { InMemoryIdempotencyStore } from '../src/memory-idempotency-store.ts'
import { PaymentsError } from '../src/types.ts'
import type { TransferResult } from '../src/types.ts'

async function newFundedPayments(
  options: { idempotencyWaitMs?: number } = {}
): Promise<{ payments: PaymentsService; ledger: LedgerService; accounts: AccountsService }> {
  const ledger = new LedgerService(new InMemoryLedgerStore(), { cellId: 'cell-1' })
  const accounts = new AccountsService({ registry: new InMemoryAccountRegistry(), ledger })
  await accounts.open('customer:alice', 'cust-1', 'Alice Perera')
  await accounts.open('customer:bob', 'cust-2', 'Bob Silva')
  await ledger.record([
    { account: 'bank:reserve', direction: 'debit', amount: 1_000_00n },
    { account: 'customer:alice', direction: 'credit', amount: 1_000_00n },
  ])

  const payments = new PaymentsService({
    accounts,
    ledger,
    idempotency: new InMemoryIdempotencyStore<TransferResult>(),
    ...(options.idempotencyWaitMs !== undefined ? { idempotencyWaitMs: options.idempotencyWaitMs } : {}),
  })
  return { payments, ledger, accounts }
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
    assert.equal(await ledger.count(), 2, 'one opening deposit block, one transfer block')
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
    assert.equal(await ledger.count(), 2, 'one opening deposit block, exactly one transfer block')
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

    const payments = new PaymentsService({ accounts, ledger, idempotency: store, idempotencyWaitMs: 60 })

    await assert.rejects(
      () => payments.transfer(request),
      (e: unknown) => e instanceof PaymentsError && e.code === 'IDEMPOTENCY_TIMEOUT'
    )
  })
})
