import { Body, Controller, Get, Param, Post, HttpException, HttpStatus, Inject } from '@nestjs/common'
import { quarantineRequest, quarantineApproval } from '@arka/contracts'
import type { QuarantineStatus } from '@arka/contracts'
import { RecoveryService, RecoveryError } from '@arka/recovery'
import type { QuarantineStatus as ServiceQuarantineStatus } from '@arka/recovery'

/**
 * A malformed body is the caller's fault and must read as 400, not 500.
 * Matched by name rather than importing `ZodError`, because zod reaches this
 * app transitively through `@arka/contracts` and is not a direct dependency.
 */
function isValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ZodError'
}

function toHttpException(error: unknown): HttpException {
  if (isValidationError(error)) {
    return new HttpException({ code: 'INVALID_REQUEST', message: 'Request body failed validation' }, HttpStatus.BAD_REQUEST)
  }
  if (error instanceof RecoveryError) {
    return new HttpException({ code: error.code, message: error.message }, HttpStatus.CONFLICT)
  }
  return new HttpException({ code: 'INTERNAL_ERROR', message: 'Unexpected error' }, HttpStatus.INTERNAL_SERVER_ERROR)
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpException({ code: 'INVALID_REQUEST', message: `${field} is required` }, HttpStatus.BAD_REQUEST)
  }
  return value
}

/** `@arka/recovery`'s `approvedBy` is `readonly string[]`; the wire contract's is a plain mutable array. */
function toWireStatus(status: ServiceQuarantineStatus): QuarantineStatus {
  return { cellId: status.cellId, state: status.state, approvedBy: [...status.approvedBy] }
}

/**
 * FR-22, screen W5: quarantine with dual approval. `packages/contracts` has
 * no dedicated "lift" shape, since a lift is the same dual-approval action
 * in reverse; the lift endpoints below validate their body directly rather
 * than force a `reason` field (`quarantineRequest`'s) that lifting does not
 * need.
 */
@Controller('v1/recovery/quarantine')
export class QuarantineController {
  constructor(@Inject(RecoveryService) private readonly recovery: RecoveryService) {}

  @Get(':cellId')
  async status(@Param('cellId') cellId: string): Promise<QuarantineStatus> {
    return toWireStatus(await this.recovery.getQuarantineStatus(cellId))
  }

  @Post('request')
  async request(@Body() body: unknown): Promise<QuarantineStatus> {
    try {
      const { cellId, reason, requestedBy } = quarantineRequest.parse(body)
      return toWireStatus(await this.recovery.requestQuarantine(cellId, reason, requestedBy))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post('approve')
  async approve(@Body() body: unknown): Promise<QuarantineStatus> {
    try {
      const { cellId, approvedBy } = quarantineApproval.parse(body)
      return toWireStatus(await this.recovery.approveQuarantine(cellId, approvedBy))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post('lift/request')
  async liftRequest(@Body() body: { cellId?: unknown; requestedBy?: unknown }): Promise<QuarantineStatus> {
    const cellId = requireString(body.cellId, 'cellId')
    const requestedBy = requireString(body.requestedBy, 'requestedBy')
    try {
      return toWireStatus(await this.recovery.requestLiftQuarantine(cellId, requestedBy))
    } catch (error) {
      throw toHttpException(error)
    }
  }

  @Post('lift/approve')
  async liftApprove(@Body() body: unknown): Promise<QuarantineStatus> {
    try {
      const { cellId, approvedBy } = quarantineApproval.parse(body)
      return toWireStatus(await this.recovery.approveLiftQuarantine(cellId, approvedBy))
    } catch (error) {
      throw toHttpException(error)
    }
  }
}
