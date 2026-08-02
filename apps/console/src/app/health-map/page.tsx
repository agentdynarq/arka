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

/** Poll cadence for the health map, and how many polls the latency graph keeps. */
const REFRESH_MS = 5000
const LATENCY_HISTORY = 60

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

/** One poll of the health map, kept so the graph can plot a real history. */
interface LatencySample {
  at: Date
  byCell: Record<string, number | undefined>
}

/** Indexed by position in the sorted cell list, never by cell id: see the
    --color-series-* comment in tokens.css. */
const SERIES_COLOURS = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
]

/**
 * Latency over time, plotted only from samples this page actually observed.
 * Nothing is seeded, back-filled or smoothed: before two polls have landed
 * the panel says it is still collecting rather than drawing a line. Cells are
 * whatever the health map returned, never a hardcoded cell-1/cell-2 pair.
 */
function CellLatencyGraph({ samples, intervalMs }: { samples: LatencySample[]; intervalMs: number }) {
  const cellIds = useMemo(() => {
    const seen = new Set<string>()
    for (const sample of samples) for (const id of Object.keys(sample.byCell)) seen.add(id)
    return [...seen].sort()
  }, [samples])

  const observed = samples.flatMap((s) => Object.values(s.byCell)).filter((v): v is number => v !== undefined)
  const windowSeconds = Math.round((samples.length * intervalMs) / 1000)

  /** P95 of what was actually measured. Fewer than 20 samples cannot support one, so it is not shown. */
  const p95 = useMemo(() => {
    if (observed.length < 20) return null
    const sorted = [...observed].sort((a, b) => a - b)
    return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
  }, [observed])

  const width = 600
  const height = 140
  const padding = 20
  const max = Math.max(10, ...observed) * 1.15

  function pointsFor(cellId: string) {
    if (samples.length < 2) return ''
    const step = (width - padding * 2) / (samples.length - 1)
    return samples
      .map((sample, i) => {
        const value = sample.byCell[cellId]
        if (value === undefined) return null
        const x = padding + i * step
        const y = height - padding - (value / max) * (height - padding * 2)
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .filter((p): p is string => p !== null)
      .join(' ')
  }

  const latest = samples[samples.length - 1]
  const axisLabels = samples.length >= 2 ? [samples[0], samples[samples.length - 1]] : []

  return (
    <Panel
      title="Cell probe latency"
      subtitle={`Sampled every ${Math.round(intervalMs / 1000)}s by this console since it was opened. History is not stored server-side, so it starts empty on every load.`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
            {cellIds.map((cellId, i) => {
              const colour = SERIES_COLOURS[i % SERIES_COLOURS.length]
              const value = latest?.byCell[cellId]
              return (
                <div key={cellId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: colour }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {cellId}: <strong style={{ color: colour }}>{value !== undefined ? `${value}ms` : 'no reading'}</strong>
                  </span>
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', gap: 16, fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
            <span>
              Samples: <strong>{samples.length}</strong>
            </span>
            <span>
              Window: <strong>{windowSeconds}s</strong>
            </span>
            {p95 !== null && (
              <span>
                P95: <strong>{p95}ms</strong>
              </span>
            )}
          </div>
        </div>

        {samples.length < 2 ? (
          <p className="ui-meta" style={{ margin: 0 }}>
            Collecting samples. The first line appears after the second poll.
          </p>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
              <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="var(--color-border)" strokeWidth="1" />
              <line x1={padding} y1={height / 2} x2={width - padding} y2={height / 2} stroke="var(--color-border)" strokeWidth="1" />
              <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="var(--color-border-strong)" strokeWidth="1" />

              {cellIds.map((cellId, i) => (
                <polyline
                  key={cellId}
                  points={pointsFor(cellId)}
                  fill="none"
                  stroke={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {axisLabels.map((sample, i) => (
                <text
                  key={sample.at.toISOString()}
                  x={i === 0 ? padding : width - padding}
                  y={height - 4}
                  textAnchor={i === 0 ? 'start' : 'end'}
                  fontSize="9"
                  fill="var(--color-text-tertiary)"
                  fontFamily="sans-serif"
                >
                  {sample.at.toLocaleTimeString()}
                </text>
              ))}
            </svg>
          </div>
        )}
      </div>
    </Panel>
  )
}

/**
 * Screen W5: the Recovery Console's health map and quarantine controls
 * (FR-21, FR-22), plus the operator audit trail (FR-25). No operator login
 * wired into this screen in this scope: identity is a free-text field lifted
 * into the sidebar (`lib/operator-context.tsx`), not a real session, same
 * simplification the FR-02 account-opening flow made for KYC review.
 */
export default function HealthMapPage() {
  const [operatorId] = useOperatorId()
  const [rows, setRows] = useState<CellRow[] | null>(null)
  const [trail, setTrail] = useState<AuditTrailEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyCellId, setBusyCellId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)
  const [latencySamples, setLatencySamples] = useState<LatencySample[]>([])

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
      const at = new Date()
      setLatencySamples((prev) => {
        const byCell: Record<string, number | undefined> = {}
        for (const row of withDetail) byCell[row.health.cellId] = row.health.latencyMs
        return [...prev, { at, byCell }].slice(-LATENCY_HISTORY)
      })
      setLastRefreshedAt(at)
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the Recovery Console API')
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_MS)
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
          <CellLatencyGraph samples={latencySamples} intervalMs={REFRESH_MS} />
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
