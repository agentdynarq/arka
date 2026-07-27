import { Body, Controller, Headers, HttpException, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { PaymentsService, PaymentsError } from '@arka/payments'
import { NotificationsService } from '@arka/notifications'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'
import { assertOwnsAccount } from './account-ownership.ts'

export interface TransferHttpResult {
  readonly transferId: string
  readonly status: 'confirmed'
  readonly ledgerBlockSeq: number
}

export interface StepUpRequiredResult {
  readonly stepUpRequired: true
  readonly reason: 'new_payee'
}

/**
 * FR-09 and FR-04 together, screen W3. A new payee triggers step-up
 * confirmation (FR-04); an over-limit amount is rejected by
 * `PaymentsService.transfer` itself as `DAILY_LIMIT_EXCEEDED` (FR-12), a
 * different failure mode from step-up on purpose: a limit is a hard stop, a
 * new payee is a soft "prove it's really you" that the same request can pass
 * on a second attempt.
 *
 * Step-up verification is one in-process method call, not a network hop.
 * See docs/adr/0006 for why that is fine at Phase 2 scale.
 */
@Controller('v1/payments')
@UseGuards(AccessTokenGuard)
export class TransfersController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  @Post('transfers')
  async transfer(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
    @Body() body: { fromAccountId?: unknown; toAccountId?: unknown; amount?: unknown }
  ): Promise<TransferHttpResult | StepUpRequiredResult> {
    if (!idempotencyKey) {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_MISSING', message: 'Idempotency-Key header is required' }, HttpStatus.BAD_REQUEST)
    }

    const fromAccountId = requireString(body.fromAccountId, 'fromAccountId')
    const toAccountId = requireString(body.toAccountId, 'toAccountId')
    const amount = requirePositiveAmount(body.amount)

    await assertOwnsAccount(this.identity, this.accounts, request, fromAccountId)

    const isNewPayee = await this.payments.isNewPayee(fromAccountId, toAccountId)
    let stepUpCompleted = false
    if (isNewPayee) {
      const verified = stepUpToken ? await this.identity.verifyStepUpToken(stepUpToken, 'new_payee') : null
      if (!verified) {
        return { stepUpRequired: true, reason: 'new_payee' }
      }
      stepUpCompleted = true
    }

    let result
    try {
      result = await this.payments.transfer({ idempotencyKey, fromAccountId, toAccountId, amount })
    } catch (error) {
      throwAsHttpException(error)
    }

    // FR-19: both sides of the transfer are told, matching "every
    // transaction" rather than only the account that initiated it.
    // FR-20: a transfer to a brand-new payee is an account-affecting
    // incident worth a security alert, on top of the step-up gate that
    // already guarded it.
    const [fromSummary, toSummary] = await Promise.all([
      this.accounts.summary(fromAccountId),
      this.accounts.summary(toAccountId),
    ])
    await Promise.all([
      this.notifications.notifyTransaction({
        customerId: fromSummary.customerId,
        accountId: fromAccountId,
        direction: 'debit',
        amountMinorUnits: amount,
        counterpartyHint: toAccountId,
        ledgerBlockHash: result.ledgerBlockHash,
      }),
      this.notifications.notifyTransaction({
        customerId: toSummary.customerId,
        accountId: toAccountId,
        direction: 'credit',
        amountMinorUnits: amount,
        counterpartyHint: fromAccountId,
        ledgerBlockHash: result.ledgerBlockHash,
      }),
      stepUpCompleted
        ? this.notifications.notifySecurity(
            fromSummary.customerId,
            'New payee added',
            `A transfer to a new payee, ${toAccountId}, was confirmed with a step-up code.`
          )
        : Promise.resolve(),
    ])

    return { transferId: result.transferId, status: result.status, ledgerBlockSeq: result.ledgerBlockSeq }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpException({ code: 'INVALID_REQUEST', message: `${field} must be a non-empty string` }, HttpStatus.BAD_REQUEST)
  }
  return value
}

function requirePositiveAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpException(
      { code: 'INVALID_REQUEST', message: 'amount must be a positive integer string in minor units' },
      HttpStatus.BAD_REQUEST
    )
  }
  return BigInt(value)
}

/** Always throws: either a translated `HttpException`, or the original error, never returns. */
function throwAsHttpException(error: unknown): never {
  if (error instanceof PaymentsError) {
    const status =
      error.code === 'INSUFFICIENT_FUNDS' || error.code === 'DAILY_LIMIT_EXCEEDED'
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : HttpStatus.BAD_REQUEST
    throw new HttpException({ code: error.code, message: error.message }, status)
  }
  if (error instanceof Error && error.name === 'AccountsError') {
    throw new HttpException(
      { code: (error as Error & { code?: string }).code ?? 'ACCOUNTS_ERROR', message: error.message },
      HttpStatus.NOT_FOUND
    )
  }
  throw error
}
