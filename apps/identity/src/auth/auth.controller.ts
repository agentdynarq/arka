import { Body, Controller, Post, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { loginRequest, mfaVerifyRequest } from '@arka/contracts'
import { IdentityService, IdentityError } from '@arka/identity'
import type { LoginChallengeResponse, SessionResponse } from '@arka/contracts'
import type { IssuedSession } from '@arka/identity'

/**
 * `@arka/contracts`' `sessionResponse` has one `expiresAt`, but a session
 * genuinely carries two: a short access-token expiry and a much longer
 * refresh-token one. Mapped to the access expiry here, since that is the
 * one a client needs to know to call `/refresh` before it lapses; the
 * contract is frozen, so this is an HTTP-boundary adaptation, not a reason
 * to change it without telling Hasitha first.
 */
function toSessionResponse(session: IssuedSession): SessionResponse {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    role: session.role,
    expiresAt: session.accessExpiresAt,
  }
}

function toHttpException(error: unknown): HttpException {
  if (error instanceof IdentityError) {
    const status =
      error.code === 'RATE_LIMITED'
        ? HttpStatus.TOO_MANY_REQUESTS
        : error.code === 'ACCOUNT_LOCKED'
          ? HttpStatus.FORBIDDEN
          : HttpStatus.UNAUTHORIZED
    return new HttpException({ code: error.code, message: error.message }, status)
  }
  return new HttpException({ code: 'INTERNAL_ERROR', message: 'Unexpected error' }, HttpStatus.INTERNAL_SERVER_ERROR)
}

@Controller('v1/auth')
export class AuthController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  /** FR-03: a login never completes to a session. It always returns an MFA challenge. */
  @Post('login')
  async login(@Body() body: unknown): Promise<LoginChallengeResponse> {
    const { username, password } = loginRequest.parse(body)
    try {
      return await this.identity.login(username, password)
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post('mfa/verify')
  async verifyMfa(@Body() body: unknown): Promise<SessionResponse> {
    const { mfaToken, totpCode } = mfaVerifyRequest.parse(body)
    try {
      return toSessionResponse(await this.identity.verifyMfa(mfaToken, totpCode))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post('refresh')
  async refresh(@Body() body: { refreshToken?: unknown }): Promise<SessionResponse> {
    if (typeof body.refreshToken !== 'string' || body.refreshToken.length === 0) {
      throw new HttpException({ code: 'INVALID_REQUEST', message: 'refreshToken is required' }, HttpStatus.BAD_REQUEST)
    }
    try {
      return toSessionResponse(await this.identity.refresh(body.refreshToken))
    } catch (error) {
      throw toHttpException(error)
    }
  }
}
