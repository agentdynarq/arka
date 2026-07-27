import { Controller, Get, UseGuards, Req, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'

export interface DashboardResponse {
  readonly username: string
  readonly role: string
  readonly accounts: ReadonlyArray<{ readonly accountId: string; readonly displayName: string; readonly balance: string }>
}

/**
 * The "done when" bar for 28 July: after re-verification and MFA, a
 * customer reaches this, a real dashboard reading a real balance through
 * `AccountsService`, not a placeholder. Guarded by `AccessTokenGuard`, so a
 * session that failed MFA or was never issued cannot reach it.
 */
@Controller('v1/me')
@UseGuards(AccessTokenGuard)
export class DashboardController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService
  ) {}

  @Get('dashboard')
  async dashboard(@Req() request: AuthenticatedRequest): Promise<DashboardResponse> {
    const session = request.session
    if (!session) {
      throw new HttpException({ code: 'ACCESS_TOKEN_INVALID', message: 'No session on request' }, HttpStatus.UNAUTHORIZED)
    }

    const profile = await this.identity.getProfile(session.userId)
    if (!profile) {
      throw new HttpException({ code: 'ACCESS_TOKEN_INVALID', message: 'Session user no longer exists' }, HttpStatus.UNAUTHORIZED)
    }

    const summaries = profile.customerId ? await this.accounts.summariesForCustomer(profile.customerId) : []

    return {
      username: profile.username,
      role: profile.role,
      accounts: summaries.map((s) => ({
        accountId: s.accountId,
        displayName: s.displayName,
        balance: s.balance.toString(),
      })),
    }
  }
}
