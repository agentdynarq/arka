import { Controller, Get, UseGuards, Inject } from '@nestjs/common'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import { QUARANTINE_CHECKER } from '../recovery/quarantine-checker.ts'
import type { QuarantineChecker } from '../recovery/quarantine-checker.ts'

export type CellStatus = 'healthy' | 'quarantined' | 'unknown'

export interface CellStatusResponse {
  readonly cellId: string
  readonly status: CellStatus
}

/**
 * Backs the sidebar's Cell status element (apps/web, lane-c/app-shell): the
 * one place in the shell that makes the Cell architecture visible to a
 * customer. Reuses the same `QuarantineChecker` `QuarantineGuard` already
 * asks (`../recovery/quarantine.guard.ts`), keyed by this process's own
 * `CELL_ID`, same reasoning as that guard: this process already knows
 * unambiguously which Cell it is, no need to re-derive one through the
 * gateway's Cell Router.
 *
 * Unlike `QuarantineGuard`, this is a read-only status display, not an
 * enforcement point, so a checker failure reports `unknown` rather than
 * failing the request: a sidebar indicator that goes blank on a transient
 * probe error is honest, a sidebar indicator that guesses "healthy" or
 * "quarantined" from a check that could not complete is not.
 */
@Controller('v1/me')
@UseGuards(AccessTokenGuard)
export class CellStatusController {
  constructor(@Inject(QUARANTINE_CHECKER) private readonly checker: QuarantineChecker) {}

  @Get('cell-status')
  async cellStatus(): Promise<CellStatusResponse> {
    const cellId = process.env.CELL_ID ?? 'cell-1'
    try {
      const quarantined = await this.checker.isQuarantined(cellId)
      return { cellId, status: quarantined ? 'quarantined' : 'healthy' }
    } catch {
      return { cellId, status: 'unknown' }
    }
  }
}
