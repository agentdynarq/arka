import { Body, Controller, Post, Inject } from '@nestjs/common'
import { reVerificationRequest } from '@arka/contracts'
import type { ReVerificationResult } from '@arka/contracts'
import { IdentityService } from '@arka/identity'

/** FR-01, screen W1: re-verify against the preserved registry before login proceeds. */
@Controller('v1/identity')
export class ReVerifyController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Post('re-verify')
  async reVerify(@Body() body: unknown): Promise<ReVerificationResult> {
    const { customerId, registryDocumentId } = reVerificationRequest.parse(body)
    return this.identity.reVerify(customerId, registryDocumentId)
  }
}
