import { Controller, Get, Param, HttpException, HttpStatus, Inject } from '@nestjs/common'
import type { CellRouteResponse } from '@arka/contracts'
import { RecoveryService } from '@arka/recovery'
import { CellRouterService } from './cell-router.service.ts'

@Controller('v1/cell-router')
export class CellRouterController {
  constructor(
    private readonly cellRouter: CellRouterService,
    @Inject(RecoveryService) private readonly recovery: RecoveryService
  ) {}

  /** Read-classified: resolves which Cell a customer is pinned to, unaffected by quarantine. */
  @Get(':customerId')
  route(@Param('customerId') customerId: string): CellRouteResponse {
    return this.cellRouter.route(customerId)
  }

  /**
   * Write-classified: the same routing, but rejected outright if the
   * resolved Cell is quarantined. This is `docs/RUNBOOK.md` P2's claim made
   * checkable over HTTP: "a write attempt against the quarantined Cell is
   * rejected with a clear read-only error, a read against it still
   * succeeds". The plain `GET :customerId` above is that read; this is that
   * write attempt.
   */
  @Get(':customerId/write-check')
  async writeCheck(@Param('customerId') customerId: string): Promise<CellRouteResponse> {
    const routed = this.cellRouter.route(customerId)
    if (await this.recovery.isQuarantined(routed.cellId)) {
      throw new HttpException(
        { code: 'CELL_QUARANTINED', message: `Cell "${routed.cellId}" is quarantined and is read-only` },
        HttpStatus.FORBIDDEN
      )
    }
    return routed
  }
}
