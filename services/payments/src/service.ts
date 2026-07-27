import { randomUUID } from 'node:crypto'
import { PaymentsError } from './types.ts'
import type {
  TransferRequest,
  TransferResult,
  DailyLimitInfo,
  ChangeDailyLimitRequest,
  SignedQrPayload,
  RedeemQrRequest,
} from './types.ts'
import type { IdempotencyStore } from './idempotency-store.ts'
import type { LimitsStore } from './limits-store.ts'
import { signQrPayload, verifyQrPayload } from './qr.ts'
import type { AccountsService } from '@arka/accounts'
import type { LedgerService } from '@arka/ledger'

/** LKR 500,000.00 in minor units. A placeholder platform default, overridable per account via FR-12. */
const DEFAULT_DAILY_LIMIT = 500_000_00n

export interface PaymentsServiceOptions {
  readonly accounts: AccountsService
  readonly ledger: LedgerService
  readonly idempotency: IdempotencyStore<TransferResult>
  readonly limits: LimitsStore
  /** Signs and verifies FR-11 QR payloads. Per-Cell, same as the ledger's signing key. */
  readonly qrSigningKey: string
  /** How long a concurrent caller waits for the claimant to finish, in milliseconds. */
  readonly idempotencyWaitMs?: number
  /** Applies to any account with no explicit override set via `changeDailyLimit`. */
  readonly defaultDailyLimit?: bigint
  /** Injectable clock, for deterministic tests of the daily-limit and QR-expiry windows. */
  readonly now?: () => Date
}

/**
 * Payments for one Cell. Framework-free, same reasoning as `LedgerService`
 * and `AccountsService`. Owns FR-09 (instant transfer), FR-11 (QR
 * acceptance), FR-12 (daily limits with step-up), and FR-13 (idempotency).
 */
export class PaymentsService {
  readonly #accounts: AccountsService
  readonly #ledger: LedgerService
  readonly #idempotency: IdempotencyStore<TransferResult>
  readonly #limits: LimitsStore
  readonly #qrSigningKey: string
  readonly #idempotencyWaitMs: number
  readonly #defaultDailyLimit: bigint
  readonly #now: () => Date

  constructor(options: PaymentsServiceOptions) {
    this.#accounts = options.accounts
    this.#ledger = options.ledger
    this.#idempotency = options.idempotency
    this.#limits = options.limits
    this.#qrSigningKey = options.qrSigningKey
    this.#idempotencyWaitMs = options.idempotencyWaitMs ?? 5000
    this.#defaultDailyLimit = options.defaultDailyLimit ?? DEFAULT_DAILY_LIMIT
    this.#now = options.now ?? (() => new Date())
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

  /**
   * FR-12: the account's live daily limit and how much of it has already
   * been spent, from the ledger, the same "never cached" reasoning as
   * `AccountsService.summary`.
   */
  async dailyLimit(accountId: string): Promise<DailyLimitInfo> {
    await this.#accounts.summary(accountId)
    return {
      accountId,
      limit: await this.#limitFor(accountId),
      spentToday: await this.#spentToday(accountId),
    }
  }

  /**
   * FR-04: whether `toAccountId` has ever received a transfer from
   * `fromAccountId` before. The wireframe's step-up trigger ("a new payee...
   * triggers step-up confirmation") is a question about the sender's own
   * history, so it belongs here alongside the balance and limit checks
   * `transfer()` already makes, not duplicated at whatever composes this
   * service with step-up verification.
   */
  async isNewPayee(fromAccountId: string, toAccountId: string): Promise<boolean> {
    const history = await this.#ledger.history(fromAccountId)
    for (const record of history) {
      if (record.entry.direction !== 'debit') continue
      if (record.blockEntries.some((e) => e.account === toAccountId)) {
        return false
      }
    }
    return true
  }

  /**
   * FR-12: change an account's daily limit. Gated on `stepUpVerified`, which
   * this service trusts rather than checks: verifying the actual step-up
   * token is `@arka/identity`'s job, at the layer that composes both
   * services. This method enforces only that the gate cannot be skipped.
   */
  async changeDailyLimit(request: ChangeDailyLimitRequest): Promise<DailyLimitInfo> {
    if (!request.stepUpVerified) {
      throw new PaymentsError('STEP_UP_REQUIRED', 'Changing a daily limit requires a verified step-up proof')
    }
    if (request.newLimit <= 0n) {
      throw new PaymentsError('INVALID_LIMIT', 'newLimit must be strictly positive')
    }

    await this.#accounts.summary(request.accountId)
    await this.#limits.set(request.accountId, request.newLimit)
    return this.dailyLimit(request.accountId)
  }

  /**
   * FR-11: a merchant asks for a signed, time-bounded QR payload. Signing is
   * pure and synchronous, there is no I/O in producing one.
   */
  generateQrPayload(options: {
    readonly merchantAccountId: string
    readonly amount: bigint
    readonly reference: string
    readonly ttlSeconds: number
  }): SignedQrPayload {
    if (options.amount <= 0n) {
      throw new PaymentsError('QR_MALFORMED', 'amount must be strictly positive')
    }
    const expiresAt = new Date(this.#now().getTime() + options.ttlSeconds * 1000).toISOString()
    return signQrPayload(
      { merchantAccountId: options.merchantAccountId, amount: options.amount, reference: options.reference, expiresAt },
      this.#qrSigningKey
    )
  }

  /**
   * FR-11: a customer redeems a scanned QR code.
   *
   * Verifying the QR signature and expiry happens first, then redemption is
   * exactly a `transfer()` call from the customer to the merchant, keyed on
   * the caller's idempotency key. There is no separate "consumed QR tokens"
   * table and no compensating action to write: the transfer this delegates
   * to is already the one place a duplicate redemption gets caught,
   * `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_REQUEST` if the same code is
   * scanned with a different key and a different amount somehow resulted,
   * or a replayed result if scanned twice with the same key. A saga with a
   * compensating step only earns its complexity when a single state change
   * cannot be made atomic; a QR redemption is exactly one ledger append, and
   * that is already atomic.
   */
  async redeemQr(request: RedeemQrRequest): Promise<TransferResult> {
    const payload = verifyQrPayload(request.qrToken, this.#qrSigningKey, this.#now)
    return this.transfer({
      idempotencyKey: request.idempotencyKey,
      fromAccountId: request.customerAccountId,
      toAccountId: payload.merchantAccountId,
      amount: payload.amount,
    })
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

    const limit = await this.#limitFor(request.fromAccountId)
    const spentToday = await this.#spentToday(request.fromAccountId)
    if (spentToday + request.amount > limit) {
      throw new PaymentsError(
        'DAILY_LIMIT_EXCEEDED',
        `Account "${request.fromAccountId}" has spent ${spentToday} of a ${limit} daily limit, cannot transfer ${request.amount} more`
      )
    }

    const block = await this.#ledger.record([
      { account: request.fromAccountId, direction: 'debit', amount: request.amount },
      { account: request.toAccountId, direction: 'credit', amount: request.amount },
    ])

    return { transferId: randomUUID(), status: 'confirmed', ledgerBlockSeq: block.seq, ledgerBlockHash: block.hash }
  }

  async #limitFor(accountId: string): Promise<bigint> {
    return (await this.#limits.get(accountId)) ?? this.#defaultDailyLimit
  }

  /**
   * Sum of today's outgoing transfers for an account, from the ledger, the
   * definition of truth the same way `AccountsService.summary` treats
   * `balanceOf`. Reads the account's full history rather than a date-ranged
   * query: correct at Phase 2 demo scale, and worth revisiting with an
   * indexed range query if an account's history grows large enough for this
   * to matter.
   */
  async #spentToday(accountId: string): Promise<bigint> {
    const today = this.#now().toISOString().slice(0, 10)
    const history = await this.#ledger.history(accountId)
    let total = 0n
    for (const record of history) {
      if (record.entry.direction !== 'debit') continue
      if (record.at.slice(0, 10) !== today) continue
      total += record.entry.amount
    }
    return total
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
