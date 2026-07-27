import { Controller, Get, Inject } from '@nestjs/common'
import { RecoveryService } from '@arka/recovery'
import type { AuditRecord } from '@arka/recovery'
import type { AuditTrailEntry } from '@arka/contracts'
import type { VerifyResult } from '@arka/ledger-core'

/**
 * `cellId` is optional on the wire (`z.string().min(1).optional()`), which
 * under `exactOptionalPropertyTypes` means the key must be omitted for a
 * platform-wide action, never present with a `null` value.
 */
function toEntry(record: AuditRecord): AuditTrailEntry {
  const entry: AuditTrailEntry = {
    id: String(record.seq),
    actor: record.actor,
    action: record.action,
    occurredAt: record.occurredAt,
    hash: record.hash,
    prevHash: record.prevHash,
  }
  return record.cellId === null ? entry : { ...entry, cellId: record.cellId }
}

/** FR-25, screen W5: the append-only operator audit trail. */
@Controller('v1/recovery/audit-trail')
export class AuditController {
  constructor(@Inject(RecoveryService) private readonly recovery: RecoveryService) {}

  @Get()
  async list(): Promise<AuditTrailEntry[]> {
    const records = await this.recovery.auditTrail()
    return records.map(toEntry)
  }

  @Get('verify')
  async verify(): Promise<VerifyResult> {
    return this.recovery.verifyAuditTrail()
  }
}
