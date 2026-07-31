'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  fetchHealthMap,
  fetchQuarantineStatus,
  fetchAuditTrail,
  requestQuarantine,
  approveQuarantine,
  requestLiftQuarantine,
  approveLiftQuarantine,
  ApiError,
} from '@/lib/api'
import type { CellHealthSnapshot, QuarantineStatus, AuditTrailEntry } from '@/lib/api'
import { Main, Panel, Field, Button, Alert, Badge, Skeleton, EmptyState, TimelineItem, Row } from '@arka/ui'
import type { BadgeTone } from '@arka/ui'

interface CellRow {
  health: CellHealthSnapshot
  quarantine: QuarantineStatus
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

function describeAudit(entry: AuditTrailEntry): string {
  const cell = entry.cellId ?? 'the platform'
  switch (entry.action) {
    case 'quarantine.requested':
      return `${entry.actor} requested quarantine of ${cell}`
    case 'quarantine.approval_recorded':
      return `${entry.actor} approved quarantining ${cell}, awaiting a second, distinct operator`
    case 'quarantine.approved':
      return `${entry.actor} gave the second approval; ${cell} is now quarantined`
    case 'lift.requested':
      return `${entry.actor} requested lifting quarantine on ${cell}`
    case 'lift.approval_recorded':
      return `${entry.actor} approved lifting quarantine on ${cell}, awaiting a second, distinct operator`
    case 'lift.approved':
      return `${entry.actor} gave the second approval; ${cell} is no longer quarantined`
    default:
      return `${entry.actor}: ${entry.action} (${cell})`
  }
}

/**
 * Recovery actions a real operator might reach for. Only integrity
 * verification is actually wired to anything in this build: no Terraform/IaC
 * exists yet (Phase 3 scope, ADR 0005), there is no separate "replay to a
 * point in time" operation since balances are always computed live from the
 * chain rather than cached (docs/RUNBOOK.md P3), and there is no per-Cell
 * signing key to rotate (docs/adr/0003's design, not yet built, see
 * docs/ARCHITECTURE.md section 8). Shown honestly rather than either wired
 * to nothing or silently dropped.
 */
const RECOVERY_ACTIONS = [
  {
    title: 'Run integrity verification',
    detail: 'Full hash-chain walk, exportable evidence',
    href: '/integrity',
    wired: true,
  },
  {
    title: 'Rebuild Cell from IaC',
    detail: 'Signed images + Terraform · target RTO 30 min',
    wired: false,
  },
  {
    title: 'Replay ledger to point in time',
    detail: 'Balances are always computed live from the chain, not cached, so there is no separate replay step to run',
    wired: false,
  },
  {
    title: 'Rotate Cell keys',
    detail: 'No per-Cell signing key exists yet to rotate (docs/adr/0003)',
    wired: false,
  },
] as const

/**
 * Screen W5: the Recovery Console's health map and quarantine controls
 * (FR-21, FR-22), plus the operator audit trail (FR-25). No operator login
 * wired into this screen in this scope: `operatorId` below is free text,
 * simulating which operator is acting, the same simplification the FR-02
 * account-opening flow made for KYC review. RBAC and session auth already
 * exist as real capabilities in `@arka/identity`; wiring them into the
 * console is future work, not pretended here.
 *
 * Matched to the real Phase 1 wireframe (get_design_context on node 11:2244).
 * The wireframe shows per-Cell customer counts, TPS and p95 latency, and an
 * "Anomaly feed" of automated security events: none of that has a real data
 * source in this build (`CellHealthSnapshot` is only `status`/`lastCheckedAt`
 * /`latencyMs`, and there is no anomaly-detection system beyond rate
 * limiting, already named in USER-GUIDE.md's "what is not built"). Shown
 * honestly below: the health probe's own latency, and the real audit trail
 * (FR-25) styled as the wireframe's feed rather than invented telemetry.
 */
export default function HealthMapPage() {
  const [rows, setRows] = useState<CellRow[] | null>(null)
  const [trail, setTrail] = useState<AuditTrailEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState('operator-1')
  const [reason, setReason] = useState('anomalous write volume')
  const [busyCellId, setBusyCellId] = useState<string | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null)

  const refresh = useCallback(async () => {
    try {
      const health = await fetchHealthMap()
      const withQuarantine = await Promise.all(
        health.map(async (h) => ({ health: h, quarantine: await fetchQuarantineStatus(h.cellId) }))
      )
      setRows(withQuarantine)
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
      await refresh()
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Action failed')
    } finally {
      setBusyCellId(null)
    }
  }

  const anyIncident = rows?.some((r) => r.health.status !== 'healthy') ?? false

  return (
    <Main size="dashboard">
      <Panel eyebrow="RECOVERY CONSOLE">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="ui-panel__title" style={{ marginBottom: 4 }}>
              Cell health
            </h1>
            <p className="ui-meta">
              {lastRefreshedAt ? `Live · updated ${lastRefreshedAt.toLocaleTimeString()}` : 'Live · loading...'}
            </p>
          </div>
          {anyIncident && <Badge tone="danger">INCIDENT MODE</Badge>}
        </div>
        {error && <Alert>{error}</Alert>}
        <div style={{ maxWidth: 360, marginTop: 12 }}>
          <Field id="operatorId" label="Acting as operator id" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
        </div>
      </Panel>

      {!rows && !error && (
        <div className="ui-grid">
          <Skeleton height="220px" />
          <Skeleton height="220px" />
        </div>
      )}

      <div className="ui-grid">
        {rows?.map(({ health, quarantine }) => (
          <Panel key={health.cellId} data-testid="cell-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{health.cellId}</span>
              <span data-testid="cell-status">
                <Badge tone={STATUS_TONE[health.status]}>{health.status}</Badge>
              </span>
            </div>
            <div className="ui-meta">
              Checked {new Date(health.lastCheckedAt).toLocaleTimeString()}
              {health.latencyMs !== undefined ? ` · health probe ${health.latencyMs}ms` : ''}
            </div>

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quarantine.state === 'none' && (
                <>
                  <Field id={`reason-${health.cellId}`} label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <Button
                    variant="danger"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => requestQuarantine(health.cellId, reason, operatorId))}
                  >
                    Request quarantine
                  </Button>
                </>
              )}

              {quarantine.state === 'pending_second_approval' && health.status !== 'quarantined' && (
                <>
                  <p className="ui-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
                    <Badge tone="warning">Pending quarantine</Badge>
                    Approved by: {quarantine.approvedBy.join(', ') || 'none yet'}. Needs a second, distinct operator.
                  </p>
                  <Button
                    variant="danger"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => approveQuarantine(health.cellId, operatorId))}
                  >
                    Approve quarantine
                  </Button>
                </>
              )}

              {quarantine.state === 'quarantined' && (
                <>
                  <p className="ui-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
                    <Badge tone="warning">Quarantined</Badge>
                    Approved by: {quarantine.approvedBy.join(', ')}.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => requestLiftQuarantine(health.cellId, operatorId))}
                  >
                    Request lift
                  </Button>
                </>
              )}

              {quarantine.state === 'pending_second_approval' && health.status === 'quarantined' && (
                <>
                  <p className="ui-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
                    <Badge tone="warning">Pending lift</Badge>
                    Needs a second, distinct operator to approve.
                  </p>
                  <Button
                    variant="secondary"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => approveLiftQuarantine(health.cellId, operatorId))}
                  >
                    Approve lift
                  </Button>
                </>
              )}

              <Link href={`/integrity?cell=${encodeURIComponent(health.cellId)}`} className="ui-button ui-button--secondary ui-button--auto">
                Inspect
              </Link>
            </div>
          </Panel>
        ))}
      </div>

      <p className="ui-meta">
        Quarantine freezes Cell egress and holds non-critical writes. Customers drop to read-only. Requires dual approval.
      </p>

      <div className="ui-dashboard">
        <div className="ui-dashboard__main">
          <Panel title="Audit trail" subtitle="Every operator action, append-only and hash-chained (FR-25).">
            <div data-testid="audit-trail">
              {trail.length === 0 ? (
                <EmptyState title="No operator actions recorded yet" hint="Quarantine or lift actions will appear here." />
              ) : (
                trail.map((entry) => (
                  <div key={entry.id} data-action={entry.action}>
                    <TimelineItem time={new Date(entry.occurredAt).toLocaleTimeString()} tone={auditTone(entry.action)}>
                      {describeAudit(entry)}
                    </TimelineItem>
                  </div>
                ))
              )}
            </div>
          </Panel>
        </div>

        <div className="ui-dashboard__rail">
          <Panel title="Recovery actions">
            {RECOVERY_ACTIONS.map((action) =>
              action.wired ? (
                <Link key={action.title} href={action.href} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Row title={action.title} meta={action.detail} value="›" />
                </Link>
              ) : (
                <div key={action.title} style={{ opacity: 0.55 }}>
                  <Row title={action.title} meta={action.detail} value={<Badge tone="neutral">Not wired yet</Badge>} />
                </div>
              )
            )}
          </Panel>
        </div>
      </div>
    </Main>
  )
}
