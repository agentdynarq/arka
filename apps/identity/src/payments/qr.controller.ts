import { Body, Controller, Headers, HttpException, HttpStatus, Inject, Post, Req, UseGuards } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { PaymentsService, PaymentsError } from '@arka/payments'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'
import { assertOwnsAccount } from './account-ownership.ts'

export interface QrGenerateHttpResult {
  readonly token: string
  readonly expiresAt: string
}

export interface QrRedeemHttpResult {
  readonly transferId: string
  readonly status: 'confirmed'
  readonly ledgerBlockSeq: number
}

/** 5 minutes. Matches the agent-cash OTP window; long enough for a customer to actually scan the code. */
const DEFAULT_QR_TTL_SECONDS = 300

/**
 * FR-11: merchant QR acceptance.
 *
 * `generate` is deliberately unauthenticated, the same precedent
 * `AgentCashController` already set: there is no merchant identity system
 * built in this scope. `redeem` is the opposite: it moves a real customer's
 * money, so it is guarded and ownership-checked exactly like
 * `TransfersController`, and requires an `Idempotency-Key` the same way.
 */
@Controller('v1/payments/qr')
export class QrController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService,
    @Inject(PaymentsService) private readonly payments: PaymentsService
  ) {}

  @Post('generate')
  async generate(
    @Body() body: { merchantAccountId?: unknown; amount?: unknown; reference?: unknown; ttlSeconds?: unknown }
  ): Promise<QrGenerateHttpResult> {
    const merchantAccountId = requireString(body.merchantAccountId, 'merchantAccountId')
    const amount = requirePositiveAmount(body.amount)
    const reference = requireString(body.reference, 'reference')
    const ttlSeconds = body.ttlSeconds === undefined ? DEFAULT_QR_TTL_SECONDS : requirePositiveInt(body.ttlSeconds, 'ttlSeconds')

    // A merchant account has to actually exist to accept payment; this is
    // the same "look the account up before trusting the id" discipline
    // every other unauthenticated endpoint here uses.
    await this.accounts.summary(merchantAccountId).catch((error) => throwAsHttpException(error))

    let signed
    try {
      signed = this.payments.generateQrPayload({ merchantAccountId, amount, reference, ttlSeconds })
    } catch (error) {
      throwAsHttpException(error)
    }
    return { token: signed.token, expiresAt: signed.payload.expiresAt }
  }

  @Post('redeem')
  @UseGuards(AccessTokenGuard)
  async redeem(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { customerAccountId?: unknown; qrToken?: unknown }
  ): Promise<QrRedeemHttpResult> {
    if (!idempotencyKey) {
      throw new HttpException({ code: 'IDEMPOTENCY_KEY_MISSING', message: 'Idempotency-Key header is required' }, HttpStatus.BAD_REQUEST)
    }
    const customerAccountId = requireString(body.customerAccountId, 'customerAccountId')
    const qrToken = requireString(body.qrToken, 'qrToken')

    await assertOwnsAccount(this.identity, this.accounts, request, customerAccountId)

    try {
      const result = await this.payments.redeemQr({ idempotencyKey, customerAccountId, qrToken })
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

function requirePositiveAmount(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw new HttpException(
      { code: 'INVALID_REQUEST', message: 'amount must be a positive integer string in minor units' },
      HttpStatus.BAD_REQUEST
    )
  }
  return BigInt(value)
}

function requirePositiveInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpException({ code: 'INVALID_REQUEST', message: `${field} must be a positive integer` }, HttpStatus.BAD_REQUEST)
  }
  return value
}

/** Always throws: either a translated `HttpException`, or the original error, never returns. */
function throwAsHttpException(error: unknown): never {
  if (error instanceof PaymentsError) {
    // Mirrors AgentCashController's mapping for the same shape of errors: an
    // expired or invalid proof is 401 (AGENT_REQUEST_EXPIRED/AGENT_OTP_INVALID
    // there, QR_EXPIRED/QR_SIGNATURE_INVALID here), an already-consumed
    // single-use resource is a plain 400 (AGENT_REQUEST_ALREADY_USED there,
    // QR_ALREADY_REDEEMED here), not a 401, nothing about the caller's own
    // credentials was wrong, the QR code itself was just already spent.
    const status =
      error.code === 'INSUFFICIENT_FUNDS' || error.code === 'DAILY_LIMIT_EXCEEDED'
        ? HttpStatus.UNPROCESSABLE_ENTITY
        : error.code === 'QR_EXPIRED' || error.code === 'QR_SIGNATURE_INVALID'
          ? HttpStatus.UNAUTHORIZED
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
