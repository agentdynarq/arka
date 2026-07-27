import { BadRequestException, Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common'
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
 *
 * `?limit=` is FR-15's server side: low-bandwidth mode asks for a small page
 * of the newest entries instead of the full history, the same `limit` the
 * service and ledger layers already carry, just not reachable over HTTP
 * before now.
 */
@Controller('v1/accounts')
@UseGuards(AccessTokenGuard)
export class HistoryController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(AccountsService) private readonly accounts: AccountsService
  ) {}

  @Get(':accountId/history')
  async history(
    @Req() request: AuthenticatedRequest,
    @Param('accountId') accountId: string,
    @Query('limit') limitParam?: string
  ): Promise<HistoryLineHttp[]> {
    await assertOwnsAccount(this.identity, this.accounts, request, accountId)

    const limit = parseLimit(limitParam)
    const lines = await this.accounts.history(accountId, limit)
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

function parseLimit(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new BadRequestException({ code: 'INVALID_LIMIT', message: 'limit must be a positive integer' })
  }
  return value
}
