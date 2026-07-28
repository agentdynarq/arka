import { Body, Controller, Get, HttpException, HttpStatus, Headers, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { PaymentsService, PaymentsError } from '@arka/payments'
import type { DailyLimitInfo } from '@arka/payments'
import { NotificationsService } from '@arka/notifications'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'
import { assertOwnsAccount } from './account-ownership.ts'
import { QuarantineGuard } from '../recovery/quarantine.guard.ts'

export interface DailyLimitHttp {
  readonly accountId: string
  readonly limit: string
  readonly spentToday: string
}

function toHttp(info: DailyLimitInfo): DailyLimitHttp {
  return { accountId: info.accountId, limit: info.limit.toString(), spentToday: info.spentToday.toString() }
}

/**
 * FR-12. `changeDailyLimit` requires a verified step-up proof, reusing the
 * `over_limit` reason `packages/contracts` already defines, the closest
 * existing semantic fit for "you are changing what counts as over limit"
 * rather than adding a new reason unilaterally to a frozen contract.
 */
@Controller('v1/payments/limits')
@UseGuards(AccessTokenGuard)
export class LimitsController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  @Get(':accountId')
  async get(@Req() request: AuthenticatedRequest, @Param('accountId') accountId: string): Promise<DailyLimitHttp> {
    await assertOwnsAccount(this.identity, this.accounts, request, accountId)
    return toHttp(await this.payments.dailyLimit(accountId))
  }

  @Post(':accountId')
  @UseGuards(QuarantineGuard)
  async change(
    @Req() request: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Headers('x-step-up-token') stepUpToken: string | undefined,
    @Body() body: { newLimit?: unknown }
  ): Promise<DailyLimitHttp> {
    await assertOwnsAccount(this.identity, this.accounts, request, accountId)

    if (!stepUpToken) {
      throw new HttpException(
        { code: 'STEP_UP_REQUIRED', message: 'Changing a daily limit requires a verified step-up proof' },
        HttpStatus.PRECONDITION_REQUIRED
      )
    }
    const verified = await this.identity.verifyStepUpToken(stepUpToken, 'over_limit')
    if (!verified) {
      throw new HttpException({ code: 'STEP_UP_TOKEN_INVALID', message: 'Step-up token is missing, expired, or already used' }, HttpStatus.UNAUTHORIZED)
    }

    const newLimit = requirePositiveAmount(body.newLimit)

    let info: DailyLimitInfo
    try {
      info = await this.payments.changeDailyLimit({ accountId, newLimit, stepUpVerified: true })
    } catch (error) {
      if (error instanceof PaymentsError) {
        throw new HttpException({ code: error.code, message: error.message }, HttpStatus.BAD_REQUEST)
      }
      throw error
    }

    const summary = await this.accounts.summary(accountId)
    await this.notifications.notifySecurity(
      summary.customerId,
      'Daily limit changed',
      `Your daily transfer limit for ${accountId} is now ${formatMinorUnits(newLimit)}.`
    )

    return toHttp(info)
  }
}

function requirePositiveAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpException(
      { code: 'INVALID_REQUEST', message: 'newLimit must be a positive integer string in minor units' },
      HttpStatus.BAD_REQUEST
    )
  }
  return BigInt(value)
}

function formatMinorUnits(value: bigint): string {
  const whole = value / 100n
  const cents = (value % 100n).toString().padStart(2, '0')
  return `${whole}.${cents}`
}
