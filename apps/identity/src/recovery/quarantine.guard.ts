import { Injectable, CanActivate, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { QUARANTINE_CHECKER } from './quarantine-checker.ts'
import type { QuarantineChecker } from './quarantine-checker.ts'

/**
 * FR-22: rejects a risky write outright if this Cell is quarantined. Applied
 * only to endpoints that actually move money or change a security-relevant
 * setting (transfer, QR redeem, agent-cash complete, daily limit change),
 * the same set `docs/RUNBOOK.md` P2 demonstrates against, not every
 * authenticated endpoint: a read (dashboard, history) must keep working on a
 * quarantined Cell, that is the whole point of "read-only", not "down".
 *
 * A quarantine check that itself fails (`QuarantineChecker` throws) also
 * rejects the request, 503 rather than 403: this is deliberately not the
 * same failure mode as "confirmed quarantined", since an operator or a judge
 * reading the response should be able to tell "this Cell is read-only" apart
 * from "the safety check itself is unreachable".
 */
@Injectable()
export class QuarantineGuard implements CanActivate {
  constructor(@Inject(QUARANTINE_CHECKER) private readonly checker: QuarantineChecker) {}

  async canActivate(): Promise<boolean> {
    const cellId = process.env.CELL_ID ?? 'cell-1'
    let quarantined: boolean

    try {
      quarantined = await this.checker.isQuarantined(cellId)
    } catch {
      throw new HttpException(
        { code: 'QUARANTINE_CHECK_UNAVAILABLE', message: 'Could not verify this Cell is not quarantined' },
        HttpStatus.SERVICE_UNAVAILABLE
      )
    }

    if (quarantined) {
      throw new HttpException(
        { code: 'CELL_QUARANTINED', message: `Cell "${cellId}" is quarantined and is read-only` },
        HttpStatus.FORBIDDEN
      )
    }

    return true
  }
}
