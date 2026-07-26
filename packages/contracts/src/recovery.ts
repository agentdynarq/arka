/**
 * The Recovery Console: live Cell health (FR-21), quarantine with dual
 * approval (FR-22), on-demand integrity verification with export (FR-23),
 * and the append-only operator audit trail (FR-25).
 */
import { z } from 'zod'
import { cellId, isoTimestamp } from './common.ts'

export const quarantineRequest = z.object({
  cellId,
  reason: z.string().min(1),
  requestedBy: z.string().min(1),
})
export type QuarantineRequest = z.infer<typeof quarantineRequest>

/**
 * Dual approval means two distinct operators, never the same operator twice.
 * `approvalSeq` is a position, not a headcount, so a request cannot be
 * satisfied by one operator calling approve twice.
 */
export const quarantineApproval = z.object({
  cellId,
  approvedBy: z.string().min(1),
})
export type QuarantineApproval = z.infer<typeof quarantineApproval>

export const quarantineState = z.enum(['none', 'pending_second_approval', 'quarantined'])
export type QuarantineState = z.infer<typeof quarantineState>

export const quarantineStatus = z.object({
  cellId,
  state: quarantineState,
  approvedBy: z.array(z.string().min(1)),
})
export type QuarantineStatus = z.infer<typeof quarantineStatus>

/** Mirrors ledger-core's VerifyResult shape for wire transport. See docs/adr/0002. */
export const integrityVerificationResult = z.object({
  ok: z.boolean(),
  records: z.number().int().nonnegative(),
  rootHash: z.string().nullable(),
  brokenAt: z.number().int().nonnegative().optional(),
  reason: z.string().optional(),
})
export type IntegrityVerificationResult = z.infer<typeof integrityVerificationResult>

export const integrityExportRequest = z.object({
  cellId,
  fromSeq: z.number().int().nonnegative().optional(),
  toSeq: z.number().int().nonnegative().optional(),
})
export type IntegrityExportRequest = z.infer<typeof integrityExportRequest>

export const integrityExportResult = z.object({
  cellId,
  generatedAt: isoTimestamp,
  result: integrityVerificationResult,
  downloadUrl: z.string().min(1).optional(),
})
export type IntegrityExportResult = z.infer<typeof integrityExportResult>

/** Same append-only, hash-chained primitive as the ledger, reused for operator actions. */
export const auditTrailEntry = z.object({
  id: z.string().min(1),
  actor: z.string().min(1),
  action: z.string().min(1),
  cellId: cellId.optional(),
  occurredAt: isoTimestamp,
  hash: z.string().min(1),
  prevHash: z.string().min(1),
})
export type AuditTrailEntry = z.infer<typeof auditTrailEntry>
