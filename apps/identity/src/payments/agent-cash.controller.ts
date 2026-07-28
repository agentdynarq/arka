import { Body, Controller, Headers, HttpException, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common'
import { AccountsService } from '@arka/accounts'
import { PaymentsService, PaymentsError } from '@arka/payments'
import type { AgentCashDirection } from '@arka/payments'
import { NotificationsService } from '@arka/notifications'
import { QuarantineGuard } from '../recovery/quarantine.guard.ts'

export interface AgentCashRequestHttpResult {
  readonly requestId: string
  readonly expiresAt: string
}

export interface AgentCashCompleteHttpResult {
  readonly transferId: string
  readonly status: 'confirmed'
  readonly ledgerBlockSeq: number
}

/**
 * FR-16: agent cash-in and cash-out, consented by the customer's OTP.
 *
 * Deliberately unauthenticated, the same precedent `QrController`-equivalent
 * QR generation already set (`transfers.controller.ts`'s `redeemQr` path):
 * there is no agent identity or login system built in this scope, out of
 * scope for the same reason a merchant login was never built for FR-11.
 * Authorisation here is the OTP itself, delivered out of band to the
 * customer via their notification inbox, never returned to the agent in the
 * `request` response.
 */
@Controller('v1/payments/agent-cash')
export class AgentCashController {
  constructor(
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  @Post('request')
  async request(
    @Body()
    body: {
      agentId?: unknown
      agentAccountId?: unknown
      customerAccountId?: unknown
      direction?: unknown
      amount?: unknown
    }
  ): Promise<AgentCashRequestHttpResult> {
    const agentId = requireString(body.agentId, 'agentId')
    const agentAccountId = requireString(body.agentAccountId, 'agentAccountId')
    const customerAccountId = requireString(body.customerAccountId, 'customerAccountId')
    const direction = requireDirection(body.direction)
    const amount = requirePositiveAmount(body.amount)

    let result
    try {
      result = await this.payments.requestAgentCash({ agentId, agentAccountId, customerAccountId, direction, amount })
    } catch (error) {
      throwAsHttpException(error)
    }

    const customer = await this.accounts.summary(customerAccountId)
    const verb = direction === 'cash_in' ? 'give you' : 'collect from you'
    await this.notifications.notifySecurity(
      customer.customerId,
      'Agent cash request',
      `An agent wants to ${verb} cash. Share this code with them only if you agree: ${result.otpCode}. It expires at ${result.expiresAt}.`
    )

    return { requestId: result.requestId, expiresAt: result.expiresAt }
  }

  @Post('complete')
  @UseGuards(QuarantineGuard)
  async complete(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { requestId?: unknown; otpCode?: unknown }
  ): Promise<AgentCashCompleteHttpResult> {
    if (!idempotencyKey) {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_MISSING', message: 'Idempotency-Key header is required' }, HttpStatus.BAD_REQUEST)
    }
    const requestId = requireString(body.requestId, 'requestId')
    const otpCode = requireString(body.otpCode, 'otpCode')

    try {
      const result = await this.payments.completeAgentCash({ idempotencyKey, requestId, otpCode })
      return { transferId: result.transferId, status: result.status, ledgerBlockSeq: result.ledgerBlockSeq }
    } catch (error) {
      throwAsHttpException(error)
    }
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpException({ code: 'INVALID_REQUEST', message: `${field} must be a non-empty string` }, HttpStatus.BAD_REQUEST)
  }
  return value
}

function requireDirection(value: unknown): AgentCashDirection {
  if (value !== 'cash_in' && value !== 'cash_out') {
    throw new HttpException({ code: 'INVALID_REQUEST', message: 'direction must be "cash_in" or "cash_out"' }, HttpStatus.BAD_REQUEST)
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
        : error.code === 'AGENT_OTP_INVALID' || error.code === 'AGENT_REQUEST_EXPIRED'
          ? HttpStatus.UNAUTHORIZED
          : error.code === 'AGENT_REQUEST_NOT_FOUND'
            ? HttpStatus.NOT_FOUND
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
