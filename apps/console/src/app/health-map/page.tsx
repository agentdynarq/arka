'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { PageHeader, OverviewStrip, Panel, Field, Button, Alert, Badge, Skeleton, EmptyState, Row } from '@arka/ui'
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
export default function HealthMapPage() {
  const [operatorId] = useOperatorId()
  const [rows, setRows] = useState<CellRow[] | null>(null)
  const [trail, setTrail] = useState<AuditTrailEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busyCellId, setBusyCellId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

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
        <OverviewStrip
          columns={[
            { label: 'Cells healthy', value: `${healthyCount} of ${rows.length}` },
            { label: 'Ledger head block', value: ledgerHeads || '-', context: 'Latest verified block per Cell' },
            { label: 'Last probe latency', value: avgLatency !== null ? `${avgLatency}ms` : '-', context: 'Averaged across Cells' },
            { label: 'Pending approvals', value: String(pendingCount), context: 'Awaiting a second, distinct operator' },
          ]}
        />
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
            <div data-testid="audit-trail">
              {trail.length === 0 ? (
                <EmptyState title="No operator actions recorded yet" hint="Quarantine or lift actions will appear here." />
              ) : (
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
                    {trail.map((entry) => (
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
