import { Controller, Get, Inject, Param, Req, UseGuards } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'
import { assertOwnsAccount } from './account-ownership.ts'

export interface HistoryLineHttp {
  readonly seq: number
  readonly at: string
  readonly direction: 'debit' | 'credit'
  readonly amount: string
  readonly counterpartyHint: string
  readonly ledgerBlockHash: string
  readonly confirmed: true
}

/**
 * FR-06 (full transaction history) and FR-08 (ledger confirmation status per
 * transaction), screen W2. Sourced live from `AccountsService.history`, never
 * cached: this is a read straight through to the ledger.
 */
@Controller('v1/accounts')
@UseGuards(AccessTokenGuard)
export class HistoryController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService
  ) {}

  @Get(':accountId/history')
  async history(@Req() request: AuthenticatedRequest, @Param('accountId') accountId: string): Promise<HistoryLineHttp[]> {
    await assertOwnsAccount(this.identity, this.accounts, request, accountId)

    const lines = await this.accounts.history(accountId)
    return lines.map((line) => ({
      seq: line.seq,
      at: line.at,
      direction: line.direction,
      amount: line.amount.toString(),
      counterpartyHint: line.counterpartyHint,
      ledgerBlockHash: line.ledgerBlockHash,
      confirmed: line.confirmed,
    }))
  }
}
