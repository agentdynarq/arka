import { HttpException, HttpStatus } from '@nestjs/common'
import type { IdentityService } from '@arka/identity'
import type { AccountsService } from '@arka/accounts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'

/**
 * Confirms the authenticated session's customer actually owns `accountId`,
 * before any transfer, history read, or limit change touches it. Without
 * this, a customer could pass any account id in a request body and act on
 * an account that is not theirs.
 */
export async function assertOwnsAccount(
  identity: IdentityService,
  accounts: AccountsService,
  request: AuthenticatedRequest,
  accountId: string
): Promise<void> {
  const session = request.session
  if (!session) {
    throw new HttpException({ code: 'ACCESS_TOKEN_INVALID', message: 'No session on request' }, HttpStatus.UNAUTHORIZED)
  }
  const profile = await identity.getProfile(session.userId)
  const owned = profile?.customerId ? await accounts.summariesForCustomer(profile.customerId) : []
  if (!owned.some((a) => a.accountId === accountId)) {
    throw new HttpException(
      { code: 'ACCOUNT_NOT_OWNED', message: `Account "${accountId}" does not belong to the authenticated customer` },
      HttpStatus.FORBIDDEN
    )
  }
}
