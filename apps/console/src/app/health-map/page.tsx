'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { Main, Panel, Field, Button, Alert, Badge, Skeleton } from '@arka/ui'
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
 * Screen W5: the Recovery Console's health map and quarantine controls
 * (FR-21, FR-22), plus the operator audit trail (FR-25). No operator login
 * wired into this screen in this scope: `operatorId` below is free text,
 * simulating which operator is acting, the same simplification the FR-02
 * account-opening flow made for KYC review. RBAC and session auth already
 * exist as real capabilities in `@arka/identity`; wiring them into the
 * console is future work, not pretended here.
 */
export default function HealthMapPage() {
  const [rows, setRows] = useState<CellRow[] | null>(null)
  const [trail, setTrail] = useState<AuditTrailEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [operatorId, setOperatorId] = useState('operator-1')
  const [reason, setReason] = useState('anomalous write volume')
  const [busyCellId, setBusyCellId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const health = await fetchHealthMap()
      const withQuarantine = await Promise.all(
        health.map(async (h) => ({ health: h, quarantine: await fetchQuarantineStatus(h.cellId) }))
      )
      setRows(withQuarantine)
      setTrail(await fetchAuditTrail())
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

  return (
    <Main size="dashboard">
      <Panel title="Recovery Console" subtitle="Live Cell health (FR-21), quarantine with dual approval (FR-22).">
        {error && <Alert>{error}</Alert>}
        <div style={{ maxWidth: 360 }}>
          <Field id="operatorId" label="Acting as operator id" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
        </div>
      </Panel>

      {!rows && !error && (
        <div className="ui-grid">
          <Skeleton height="160px" />
          <Skeleton height="160px" />
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
              {health.latencyMs !== undefined ? ` · ${health.latencyMs}ms` : ''}
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
                  <p className="ui-meta" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                    Pending quarantine, approved by: {quarantine.approvedBy.join(', ') || 'none yet'}. Needs a second, distinct
                    operator.
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
                  <p className="ui-meta" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                    Quarantined. Approved by: {quarantine.approvedBy.join(', ')}.
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
                  <p className="ui-meta" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                    Pending lift. Needs a second, distinct operator to approve.
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
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Audit trail (FR-25)">
        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table" data-testid="audit-trail">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Cell</th>
                <th>Occurred at</th>
                <th>Hash</th>
              </tr>
            </thead>
            <tbody>
              {trail.map((entry) => (
                <tr key={entry.id}>
                  <td>{entry.id}</td>
                  <td>{entry.actor}</td>
                  <td>{entry.action}</td>
                  <td>{entry.cellId ?? '(platform)'}</td>
                  <td>{new Date(entry.occurredAt).toLocaleString()}</td>
                  <td className="ui-hash">{entry.hash.slice(0, 12)}...</td>
                </tr>
              ))}
              {trail.length === 0 && (
                <tr>
                  <td colSpan={6} className="ui-meta">
                    No operator actions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </Main>
  )
}
