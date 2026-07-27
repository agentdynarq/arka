import { Body, Controller, Post, UseGuards, Req, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { stepUpRequest, stepUpReason } from '@arka/contracts'
import type { StepUpResponse } from '@arka/contracts'
import { IdentityService, IdentityError } from '@arka/identity'
import { AccessTokenGuard } from './access-token.guard.ts'
import type { AuthenticatedRequest } from './access-token.guard.ts'

/**
 * FR-04, step-up authentication. Not wired to a risky action in this scope
 * (no HTTP endpoint yet needs guarding), but exposed and testable as a real
 * capability rather than left as a contract shape with nothing behind it.
 * See `@arka/identity`'s README for why.
 */
@Controller('v1/identity/step-up')
export class StepUpController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Post('challenge')
  @UseGuards(AccessTokenGuard)
  async challenge(@Req() request: AuthenticatedRequest, @Body() body: { reason?: unknown }) {
    const reason = stepUpReason.parse(body.reason)
    const accessToken = request.headers.authorization
    const token = Array.isArray(accessToken) ? accessToken[0] : accessToken
    return this.identity.issueActionChallenge((token ?? '').slice('Bearer '.length), reason)
  }

  @Post('verify')
  async verify(@Body() body: unknown): Promise<StepUpResponse> {
    const { actionToken, reason, totpCode } = stepUpRequest.parse(body)
    try {
      return await this.identity.completeStepUp(actionToken, reason, totpCode)
    } catch (error) {
      if (error instanceof IdentityError) {
        throw new HttpException({ code: error.code, message: error.message }, HttpStatus.UNAUTHORIZED)
      }
      throw error
    }
  }
}
