/**
 * Thin fetch wrapper over `@arka/recovery-app`. No SDK, no generated client,
 * same approach as `apps/web/src/lib/api.ts`: a 10%-weighted client bucket
 * following the Phase 1 wireframes, not a place to build infrastructure.
 */
const API_BASE = process.env.NEXT_PUBLIC_RECOVERY_API_URL ?? 'http://localhost:3002'

export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.code ?? 'UNKNOWN_ERROR', data.message ?? 'Request failed')
  return data as T
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) throw new ApiError(data.code ?? 'UNKNOWN_ERROR', data.message ?? 'Request failed')
  return data as T
}

export type CellHealthStatus = 'healthy' | 'degraded' | 'quarantined'

export interface CellHealthSnapshot {
  cellId: string
  status: CellHealthStatus
  lastCheckedAt: string
  latencyMs?: number
}

export function fetchHealthMap(): Promise<CellHealthSnapshot[]> {
  return get('/v1/recovery/health-map')
}

export type QuarantineState = 'none' | 'pending_second_approval' | 'quarantined'

export interface QuarantineStatus {
  cellId: string
  state: QuarantineState
  approvedBy: string[]
}

export function fetchQuarantineStatus(cellId: string): Promise<QuarantineStatus> {
  return get(`/v1/recovery/quarantine/${encodeURIComponent(cellId)}`)
}

export function requestQuarantine(cellId: string, reason: string, requestedBy: string): Promise<QuarantineStatus> {
  return post('/v1/recovery/quarantine/request', { cellId, reason, requestedBy })
}

export function approveQuarantine(cellId: string, approvedBy: string): Promise<QuarantineStatus> {
  return post('/v1/recovery/quarantine/approve', { cellId, approvedBy })
}

export function requestLiftQuarantine(cellId: string, requestedBy: string): Promise<QuarantineStatus> {
  return post('/v1/recovery/quarantine/lift/request', { cellId, requestedBy })
}

export function approveLiftQuarantine(cellId: string, approvedBy: string): Promise<QuarantineStatus> {
  return post('/v1/recovery/quarantine/lift/approve', { cellId, approvedBy })
}

export interface AuditTrailEntry {
  id: string
  actor: string
  action: string
  cellId?: string
  occurredAt: string
  hash: string
  prevHash: string
}

export function fetchAuditTrail(): Promise<AuditTrailEntry[]> {
  return get('/v1/recovery/audit-trail')
}

export interface IntegrityVerificationResult {
  ok: boolean
  records: number
  rootHash: string | null
  brokenAt?: number
  reason?: string
}

export interface IntegrityEvidence {
  cellId: string
  verifiedAt: string
  upTo: number | null
  result: IntegrityVerificationResult
}

export function fetchAllIntegrity(): Promise<IntegrityEvidence[]> {
  return get('/v1/recovery/integrity')
}

export function fetchIntegrity(cellId: string, upTo?: number): Promise<IntegrityEvidence> {
  const query = upTo === undefined ? '' : `?upTo=${upTo}`
  return get(`/v1/recovery/integrity/${encodeURIComponent(cellId)}${query}`)
}

/** Not a `fetch`: this one navigates the browser to a file download, same as any other export link. */
export function integrityExportUrl(cellId: string, upTo?: number): string {
  const query = upTo === undefined ? '' : `?upTo=${upTo}`
  return `${API_BASE}/v1/recovery/integrity/${encodeURIComponent(cellId)}/export${query}`
}
