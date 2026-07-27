import { Controller, Get, HttpException, HttpStatus, Inject, Param, Query, Res } from '@nestjs/common'
import { integrityQuery } from '@arka/contracts'
import { RecoveryService, RecoveryError } from '@arka/recovery'
import type { IntegrityEvidence } from '@arka/ledger'

/**
 * The minimal response surface this controller needs for a file download, not
 * the full `express` `Response`. Same reasoning as `AuthenticatedRequest` in
 * `apps/identity`: a type-only dependency on `express` for two methods isn't
 * worth adding.
 */
interface DownloadableResponse {
  setHeader(name: string, value: string): unknown
  send(body: string): unknown
}

function toHttpException(error: unknown): HttpException {
  if (error instanceof RecoveryError) {
    const status = error.code === 'CELL_NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT
    return new HttpException({ code: error.code, message: error.message }, status)
  }
  return new HttpException({ code: 'INTERNAL_ERROR', message: 'Unexpected error' }, HttpStatus.INTERNAL_SERVER_ERROR)
}

function parseUpTo(raw: string | undefined, cellId: string): { upTo?: number } | undefined {
  const query = integrityQuery.parse({ cellId, upTo: raw === undefined ? undefined : Number(raw) })
  return query.upTo === undefined ? undefined : { upTo: query.upTo }
}

/**
 * FR-23, screen W6: on-demand ledger integrity verification with export. P1
 * in `docs/RUNBOOK.md`: select the Cell and (optionally) the block range,
 * run verification, export the evidence.
 */
@Controller('v1/recovery/integrity')
export class IntegrityController {
  constructor(@Inject(RecoveryService) private readonly recovery: RecoveryService) {}

  /** Every configured Cell's evidence in one call, for the console's overview. */
  @Get()
  async all(): Promise<IntegrityEvidence[]> {
    return this.recovery.verifyAllIntegrity()
  }

  @Get(':cellId')
  async one(@Param('cellId') cellId: string, @Query('upTo') upTo?: string): Promise<IntegrityEvidence> {
    try {
      return await this.recovery.verifyIntegrity(cellId, parseUpTo(upTo, cellId))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  /**
   * Same verification as `one`, delivered as a downloadable file rather than
   * a JSON body an operator would have to copy by hand. The file *is* the
   * evidence RUNBOOK P1 says to export, not a summary of it.
   */
  @Get(':cellId/export')
  async export(
    @Param('cellId') cellId: string,
    @Query('upTo') upTo: string | undefined,
    @Res() res: DownloadableResponse
  ): Promise<void> {
    let evidence: IntegrityEvidence
    try {
      evidence = await this.recovery.verifyIntegrity(cellId, parseUpTo(upTo, cellId))
    } catch (error) {
      throw toHttpException(error)
    }

    const filename = `integrity-${cellId}-${evidence.verifiedAt.replace(/[:.]/g, '-')}.json`
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.send(JSON.stringify(evidence, null, 2))
  }
}
