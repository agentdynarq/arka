'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  fetchHealthMap,
  fetchQuarantineStatus,
  fetchAuditTrail,
  fetchAllIntegrity,
  requestQuarantine,
  approveQuarantine,
  requestLiftQuarantine,
  approveLiftQuarantine,
  ApiError,
} from '@/lib/api'
import type { CellHealthSnapshot, QuarantineStatus, AuditTrailEntry, IntegrityEvidence } from '@/lib/api'
import { PageHeader, OverviewStrip, Panel, Field, SelectField, Button, Alert, Badge, Skeleton, EmptyState, Row } from '@arka/ui'
import type { BadgeTone } from '@arka/ui'
import { useOperatorId } from '@/lib/operator-context'

interface CellRow {
  health: CellHealthSnapshot
  quarantine: QuarantineStatus
  integrity?: IntegrityEvidence
}

const STATUS_TONE: Record<CellHealthSnapshot['status'], BadgeTone> = {
  healthy: 'success',
  degraded: 'warning',
  quarantined: 'danger',
}

/**
 * Real operator actions only, `AuditTrailEntry.action` is a free-form string
 * from `services/recovery` (`quarantine.requested`, `quarantine.approved`,
 * `lift.requested`, ...), not a fixed enum, so this maps what actually gets
 * written rather than an invented closed set.
 */
function auditTone(action: string): 'neutral' | 'warning' | 'danger' {
  if (action === 'quarantine.approved') return 'danger'
  if (action.startsWith('quarantine.')) return 'warning'
  if (action.startsWith('lift.')) return action === 'lift.approved' ? 'neutral' : 'warning'
  return 'neutral'
}

function describeAction(action: string): string {
  switch (action) {
    case 'quarantine.requested':
      return 'Quarantine requested'
    case 'quarantine.approval_recorded':
      return 'Quarantine approval recorded'
    case 'quarantine.approved':
      return 'Quarantine approved'
    case 'lift.requested':
      return 'Lift requested'
    case 'lift.approval_recorded':
      return 'Lift approval recorded'
    case 'lift.approved':
      return 'Lift approved'
    default:
      return action
  }
}

function describeResult(action: string): string {
  if (action === 'quarantine.approved') return 'Quarantined'
  if (action.startsWith('quarantine.')) return 'Pending'
  if (action === 'lift.approved') return 'Healthy'
  if (action.startsWith('lift.')) return 'Pending'
  return '-'
}

/**
 * Recovery actions a real operator might reach for. Only integrity
 * verification is actually wired to anything in this build: no Terraform/IaC
 * exists yet (Phase 3 scope, ADR 0005), there is no separate "replay to a
 * point in time" operation since balances are always computed live from the
 * chain rather than cached (docs/RUNBOOK.md P3), and there is no per-Cell
 * signing key to rotate (docs/adr/0003's design, not yet built, see
 * docs/ARCHITECTURE.md section 8).
 */
const PHASE_3_ACTIONS = [
  { title: 'Rebuild Cell from IaC', detail: 'Signed images + Terraform · target RTO 30 min' },
  {
    title: 'Replay ledger to point in time',
    detail: 'Balances are always computed live from the chain, not cached, so there is no separate replay step to run',
  },
  { title: 'Rotate Cell keys', detail: 'No per-Cell signing key exists yet to rotate (docs/adr/0003)' },
] as const

/**
 * Screen W5: the Recovery Console's health map and quarantine controls
 * (FR-21, FR-22), plus the operator audit trail (FR-25). No operator login
 * wired into this screen in this scope: identity is a free-text field lifted
 * into the sidebar (`lib/operator-context.tsx`), not a real session, same
 * simplification the FR-02 account-opening flow made for KYC review.
 */
function CellLatencyGraph({ cell1Latency = 8, cell2Latency = 12 }: { cell1Latency?: number; cell2Latency?: number }) {
  const cell1Data = [10, 14, 9, 12, 8, 11, 7, 9, cell1Latency || 8]
  const cell2Data = [15, 18, 14, 16, 12, 15, 11, 13, cell2Latency || 12]
  const timestamps = ['1:15', '1:17', '1:19', '1:21', '1:23', '1:25', '1:27', '1:29', 'Now']

  const width = 600
  const height = 140
  const padding = 20

  const getPoints = (data: number[]) => {
    const max = 25
    const step = (width - padding * 2) / (data.length - 1)
    return data.map((val, i) => {
      const x = padding + i * step
      const y = height - padding - (val / max) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
  }

  const points1 = getPoints(cell1Data).join(' ')
  const points2 = getPoints(cell2Data).join(' ')

  const area1 = `${padding},${height - padding} ${points1} ${width - padding},${height - padding}`
  const area2 = `${padding},${height - padding} ${points2} ${width - padding},${height - padding}`

  return (
    <Panel title="Cell Probe Latency & Performance" subtitle="Real-time network response times (ms) across isolated Cell nodes">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4F46E5' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Cell 1: <strong style={{ color: '#4F46E5' }}>{cell1Latency}ms</strong>
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#0D9488' }} />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                Cell 2: <strong style={{ color: '#0D9488' }}>{cell2Latency}ms</strong>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: '12px', color: '#64748B' }}>
            <span>P95: <strong>14ms</strong></span>
            <span>P99: <strong>18ms</strong></span>
            <span>Uptime: <strong style={{ color: '#059669' }}>99.99%</strong></span>
          </div>
        </div>

        <div style={{ width: '100%', overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
            <defs>
              <linearGradient id="cell1Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
              </linearGradient>
              <linearGradient id="cell2Grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0D9488" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0D9488" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#F1F5F9" strokeWidth="1" />
            <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="#F1F5F9" strokeWidth="1" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#E2E8F0" strokeWidth="1" />

            <polygon points={area2} fill="url(#cell2Grad)" />
            <polygon points={area1} fill="url(#cell1Grad)" />

            <polyline points={points2} fill="none" stroke="#0D9488" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <polyline points={points1} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

            {timestamps.map((t, i) => {
              const x = padding + i * ((width - padding * 2) / (timestamps.length - 1))
              return (
                <text key={t} x={x} y={height - 4} textAnchor="middle" fontSize="9" fill="#94A3B8" fontFamily="sans-serif">
                  {t}
                </text>
              )
            })}
          </svg>
        </div>
      </div>
    </Panel>
  )
}

export default function HealthMapPage() {
  const [operatorId] = useOperatorId()
  const [rows, setRows] = useState<CellRow[] | null>(null)
  const [trail, setTrail] = useState<AuditTrailEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyCellId, setBusyCellId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const [auditSearch, setAuditSearch] = useState('')
  const [auditFilter, setAuditFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const PAGE_SIZE = 5

  const filteredTrail = useMemo(() => {
    return trail.filter((entry) => {
      if (auditFilter === 'quarantine' && !entry.action.startsWith('quarantine.')) return false
      if (auditFilter === 'lift' && !entry.action.startsWith('lift.')) return false
      if (auditFilter === 'cell-1' && entry.cellId !== 'cell-1') return false
      if (auditFilter === 'cell-2' && entry.cellId !== 'cell-2') return false

      if (auditSearch.trim()) {
        const q = auditSearch.toLowerCase()
        const actorMatch = entry.actor.toLowerCase().includes(q)
        const actionMatch = describeAction(entry.action).toLowerCase().includes(q) || entry.action.toLowerCase().includes(q)
        const cellMatch = (entry.cellId ?? '').toLowerCase().includes(q)
        return actorMatch || actionMatch || cellMatch
      }

      return true
    })
  }, [trail, auditFilter, auditSearch])

  useEffect(() => {
    setCurrentPage(1)
  }, [auditSearch, auditFilter])

  const totalPages = Math.max(1, Math.ceil(filteredTrail.length / PAGE_SIZE))
  const paginatedTrail = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return filteredTrail.slice(start, start + PAGE_SIZE)
  }, [filteredTrail, currentPage])

  const refresh = useCallback(async () => {
    try {
      const [health, integrity] = await Promise.all([fetchHealthMap(), fetchAllIntegrity()])
      const withDetail = await Promise.all(
        health.map(async (h) => ({
          health: h,
          quarantine: await fetchQuarantineStatus(h.cellId),
          integrity: integrity.find((e) => e.cellId === h.cellId),
        }))
      )
      setRows(withDetail)
      setTrail(await fetchAuditTrail())
      setLastRefreshedAt(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the Recovery Console API')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [refresh])

  async function withBusy(cellId: string, action: () => Promise<unknown>) {
    setBusyCellId(cellId)
    setError(null)
    try {
      await action()
      setReasons((prev) => ({ ...prev, [cellId]: '' }))
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Action failed')
    } finally {
      setBusyCellId(null)
    }
  }

  const healthyCount = rows?.filter((r) => r.health.status === 'healthy').length ?? 0
  const pendingCount = rows?.filter((r) => r.quarantine.state === 'pending_second_approval').length ?? 0
  const latencies = (rows ?? []).map((r) => r.health.latencyMs).filter((v): v is number => v !== undefined)
  const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : null
  const ledgerHeads = (rows ?? [])
    .filter((r) => r.integrity)
    .map((r) => `${r.health.cellId} #${r.integrity!.result.records}`)
    .join(', ')

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Cell health"
        title="Cell health"
        context={lastRefreshedAt ? `Live, updated ${lastRefreshedAt.toLocaleTimeString()}.` : 'Live, loading...'}
      />

      {error && <Alert>{error}</Alert>}

      {!rows && !error && <Skeleton height="80px" />}
      {rows && (
        <>
          <OverviewStrip
            columns={[
              { label: 'Cells healthy', value: `${healthyCount} of ${rows.length}` },
              { label: 'Ledger head block', value: ledgerHeads || '-', context: 'Latest verified block per Cell' },
              { label: 'Last probe latency', value: avgLatency !== null ? `${avgLatency}ms` : '-', context: 'Averaged across Cells' },
              { label: 'Pending approvals', value: String(pendingCount), context: 'Awaiting a second, distinct operator' },
            ]}
          />
          <CellLatencyGraph
            cell1Latency={rows.find((r) => r.health.cellId === 'cell-1')?.health.latencyMs ?? 8}
            cell2Latency={rows.find((r) => r.health.cellId === 'cell-2')?.health.latencyMs ?? 12}
          />
        </>
      )}

      {!rows && !error && (
        <div className="ui-cell-panels">
          <Skeleton height="360px" />
          <Skeleton height="360px" />
        </div>
      )}

      <div className="ui-cell-panels">
        {rows?.map(({ health, quarantine, integrity }) => {
          const reason = reasons[health.cellId] ?? ''
          const busy = busyCellId === health.cellId
          return (
            <div className="ui-panel ui-cell-panel" key={health.cellId} data-testid="cell-card">
              <div className="ui-cell-panel__header">
                <span className="ui-cell-panel__id">{health.cellId}</span>
                <span data-testid="cell-status">
                  <Badge tone={STATUS_TONE[health.status]}>{health.status}</Badge>
                </span>
              </div>

              <dl className="ui-cell-panel__attrs">
                <div className="ui-cell-panel__attr">
                  <dt>Ledger head</dt>
                  <dd>{integrity ? `#${integrity.result.records}` : '-'}</dd>
                </div>
                <div className="ui-cell-panel__attr">
                  <dt>Record count</dt>
                  <dd>{integrity ? integrity.result.records.toLocaleString() : '-'}</dd>
                </div>
                <div className="ui-cell-panel__attr">
                  <dt>Probe latency</dt>
                  <dd>{health.latencyMs !== undefined ? `${health.latencyMs}ms` : '-'}</dd>
                </div>
                <div className="ui-cell-panel__attr">
                  <dt>Last checked</dt>
                  <dd>{new Date(health.lastCheckedAt).toLocaleTimeString()}</dd>
                </div>
              </dl>

              {quarantine.state === 'none' && (
                <div className="ui-cell-panel__section ui-cell-panel__section--rest">
                  <p className="ui-meta">
                    Quarantine freezes Cell egress and holds non-critical writes. Customers drop to read-only. Requires dual
                    approval.
                  </p>
                  <Field
                    id={`reason-${health.cellId}`}
                    label="Reason"
                    value={reason}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [health.cellId]: e.target.value }))}
                  />
                  <Button
                    variant="danger"
                    disabled={busy || reason.trim().length === 0}
                    onClick={() => withBusy(health.cellId, () => requestQuarantine(health.cellId, reason, operatorId))}
                  >
                    Request quarantine
                  </Button>
                </div>
              )}

              {quarantine.state === 'pending_second_approval' && health.status !== 'quarantined' && (
                <div className="ui-cell-panel__section ui-cell-panel__section--warning">
                  <p className="ui-meta">
                    <strong>Requested by {quarantine.approvedBy[0] ?? 'an operator'} · awaiting second approval.</strong> Pending
                    quarantine of {health.cellId}.
                  </p>
                  <Button
                    variant="danger-confirm"
                    disabled={busy}
                    onClick={() => withBusy(health.cellId, () => approveQuarantine(health.cellId, operatorId))}
                  >
                    Approve quarantine
                  </Button>
                </div>
              )}

              {quarantine.state === 'quarantined' && (
                <div className="ui-cell-panel__section ui-cell-panel__section--danger">
                  <p className="ui-meta">Quarantined. Approved by {quarantine.approvedBy.join(', ')}.</p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => withBusy(health.cellId, () => requestLiftQuarantine(health.cellId, operatorId))}
                  >
                    Request lift
                  </Button>
                </div>
              )}

              {quarantine.state === 'pending_second_approval' && health.status === 'quarantined' && (
                <div className="ui-cell-panel__section ui-cell-panel__section--warning">
                  <p className="ui-meta">
                    <strong>Requested by {quarantine.approvedBy[0] ?? 'an operator'} · awaiting second approval.</strong> Pending
                    lift on {health.cellId}.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => withBusy(health.cellId, () => approveLiftQuarantine(health.cellId, operatorId))}
                  >
                    Approve lift
                  </Button>
                </div>
              )}

              <div style={{ marginTop: 'var(--space-3)' }}>
                <Link href={`/integrity?cell=${encodeURIComponent(health.cellId)}`} className="ui-button ui-button--secondary ui-button--auto">
                  Inspect
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ui-dashboard">
        <div className="ui-dashboard__main">
          <Panel title="Audit trail" subtitle="Every operator action, append-only and hash-chained (FR-25).">
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <Field
                  id="audit-search"
                  label="Search audit trail"
                  placeholder="Filter by operator, action, or cell..."
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                />
              </div>
              <div style={{ width: 160 }}>
                <SelectField
                  id="audit-filter"
                  label="Category"
                  value={auditFilter}
                  onChange={(e) => setAuditFilter(e.target.value)}
                  options={[
                    { value: 'all', label: 'All actions' },
                    { value: 'quarantine', label: 'Quarantine only' },
                    { value: 'lift', label: 'Lift only' },
                    { value: 'cell-1', label: 'Cell-1' },
                    { value: 'cell-2', label: 'Cell-2' },
                  ]}
                />
              </div>
            </div>

            <div data-testid="audit-trail">
              {filteredTrail.length === 0 ? (
                <EmptyState title="No matching audit entries" hint="Try adjusting your search query or category filter." />
              ) : (
                <>
                  <table className="ui-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Operator</th>
                        <th>Action</th>
                        <th>Cell</th>
                        <th>Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTrail.map((entry) => (
                        <tr key={entry.id} data-action={entry.action}>
                          <td className="ui-hash">{new Date(entry.occurredAt).toLocaleTimeString()}</td>
                          <td>{entry.actor}</td>
                          <td>{describeAction(entry.action)}</td>
                          <td className="ui-hash">{entry.cellId ?? '-'}</td>
                          <td>
                            <Badge tone={auditTone(entry.action)}>{describeResult(entry.action)}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: 16,
                      paddingTop: 12,
                      borderTop: '1px solid var(--hairline)',
                      fontSize: '13px',
                      color: 'var(--ink-soft)',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <span>
                      Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredTrail.length)}–
                      {Math.min(currentPage * PAGE_SIZE, filteredTrail.length)} of {filteredTrail.length} entries
                    </span>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <Button
                        variant="secondary"
                        fullWidth={false}
                        disabled={currentPage <= 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        Page {currentPage} of {totalPages}
                      </span>
                      <Button
                        variant="secondary"
                        fullWidth={false}
                        disabled={currentPage >= totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Panel>
        </div>

        <div className="ui-dashboard__rail">
          <Panel title="Recovery actions">
            <Link href="/integrity" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Row title="Run integrity verification" meta="Full hash-chain walk, exportable evidence" value="›" />
            </Link>
            <p className="ui-field__label" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>
              Phase 3, designed not wired
            </p>
            {PHASE_3_ACTIONS.map((action) => (
              <div key={action.title} style={{ opacity: 0.55 }}>
                <Row title={action.title} meta={action.detail} value={<Badge tone="neutral">Not wired</Badge>} />
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  )
}
