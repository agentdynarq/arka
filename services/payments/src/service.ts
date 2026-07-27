import { randomUUID } from 'node:crypto'
import { PaymentsError } from './types.ts'
import type { TransferRequest, TransferResult } from './types.ts'
import type { IdempotencyStore } from './idempotency-store.ts'
import type { AccountsService } from '@arka/accounts'
import type { LedgerService } from '@arka/ledger'

export interface PaymentsServiceOptions {
  readonly accounts: AccountsService
  readonly ledger: LedgerService
  readonly idempotency: IdempotencyStore<TransferResult>
  /** How long a concurrent caller waits for the claimant to finish, in milliseconds. */
  readonly idempotencyWaitMs?: number
}

/**
 * Payments for one Cell. Framework-free, same reasoning as `LedgerService`
 * and `AccountsService`. Owns FR-09 (instant transfer) and FR-13
 * (idempotency).
 */
export class PaymentsService {
  readonly #accounts: AccountsService
  readonly #ledger: LedgerService
  readonly #idempotency: IdempotencyStore<TransferResult>
  readonly #idempotencyWaitMs: number

  constructor(options: PaymentsServiceOptions) {
    this.#accounts = options.accounts
    this.#ledger = options.ledger
    this.#idempotency = options.idempotency
    this.#idempotencyWaitMs = options.idempotencyWaitMs ?? 5000
  }

  /**
   * Move money between two accounts in this Cell, exactly once per
   * idempotency key.
   *
   * The first caller to claim a key executes the transfer and stores the
   * result. Every other caller for that same key, whether truly concurrent
   * or a later retry after a timeout, is handed the same stored result and
   * never re-executes. Reusing a key with a materially different request
   * (a different amount or accounts) is rejected rather than silently
   * returning a stale result for a request that never ran.
   */
  async transfer(request: TransferRequest): Promise<TransferResult> {
    if (request.fromAccountId === request.toAccountId) {
      throw new PaymentsError('SAME_ACCOUNT', 'fromAccountId and toAccountId must differ')
    }

    const fingerprint = fingerprintOf(request)
    const claim = await this.#idempotency.reserve(request.idempotencyKey, fingerprint)

    if (!claim.claimed) {
      if (claim.existing.requestFingerprint !== fingerprint) {
        throw new PaymentsError(
          'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST',
          `Idempotency key "${request.idempotencyKey}" was already used for a different request`
        )
      }
      return this.#awaitResult(request.idempotencyKey)
    }

    try {
      const result = await this.#execute(request)
      await this.#idempotency.complete(request.idempotencyKey, result)
      return result
    } catch (error) {
      await this.#idempotency.release(request.idempotencyKey)
      throw error
    }
  }

  async #execute(request: TransferRequest): Promise<TransferResult> {
    const from = await this.#accounts.summary(request.fromAccountId)
    await this.#accounts.summary(request.toAccountId)

    if (from.balance < request.amount) {
      throw new PaymentsError(
        'INSUFFICIENT_FUNDS',
        `Account "${request.fromAccountId}" holds ${from.balance}, cannot transfer ${request.amount}`
      )
    }

    const block = await this.#ledger.record([
      { account: request.fromAccountId, direction: 'debit', amount: request.amount },
      { account: request.toAccountId, direction: 'credit', amount: request.amount },
    ])

    return { transferId: randomUUID(), status: 'confirmed', ledgerBlockSeq: block.seq }
  }

  async #awaitResult(key: string): Promise<TransferResult> {
    const deadline = Date.now() + this.#idempotencyWaitMs
    while (Date.now() < deadline) {
      const record = await this.#idempotency.get(key)
      if (record?.status === 'completed' && record.result) {
        return record.result
      }
      await sleep(20)
    }
    throw new PaymentsError(
      'IDEMPOTENCY_TIMEOUT',
      `Timed out waiting for the claimant of idempotency key "${key}" to finish`
    )
  }
}

/**
 * A stable fingerprint of the fields that must match for two calls to be the
 * same request. JSON-encoded as an array rather than joined with a
 * delimiter: account ids already contain colons (`customer:alice`) and could
 * plausibly contain any other single separator character, and JSON escaping
 * keeps the encoding unambiguous without having to forbid one. A NUL
 * separator was considered and rejected: Postgres `text` columns reject the
 * NUL byte outright, which would have made this throw against the real store
 * the moment an account id happened to need it.
 */
function fingerprintOf(request: TransferRequest): string {
  return JSON.stringify([request.fromAccountId, request.toAccountId, request.amount.toString()])
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
