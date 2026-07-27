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

interface CellRow {
  health: CellHealthSnapshot
  quarantine: QuarantineStatus
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
    <div className="page">
      <h1>Recovery Console</h1>
      <p className="subtitle">Live Cell health (FR-21), quarantine with dual approval (FR-22).</p>

      {error && <div className="error">{error}</div>}

      <div className="actions" style={{ marginBottom: 24, maxWidth: 420 }}>
        <label>
          Acting as operator id
          <input value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
        </label>
      </div>

      {!rows && !error && <p>Loading health map...</p>}

      <div className="cell-grid">
        {rows?.map(({ health, quarantine }) => (
          <div className="cell-card" key={health.cellId}>
            <div className="cell-id">{health.cellId}</div>
            <span className={`status-badge ${health.status}`}>{health.status}</span>
            <div className="meta">
              Checked {new Date(health.lastCheckedAt).toLocaleTimeString()}
              {health.latencyMs !== undefined ? ` &middot; ${health.latencyMs}ms` : ''}
            </div>

            <div className="actions">
              {quarantine.state === 'none' && (
                <>
                  <input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => requestQuarantine(health.cellId, reason, operatorId))}
                  >
                    Request quarantine
                  </button>
                </>
              )}

              {quarantine.state === 'pending_second_approval' && health.status !== 'quarantined' && (
                <>
                  <p className="pending-note">
                    Pending quarantine, approved by: {quarantine.approvedBy.join(', ') || 'none yet'}. Needs a second,
                    distinct operator.
                  </p>
                  <button
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => approveQuarantine(health.cellId, operatorId))}
                  >
                    Approve quarantine
                  </button>
                </>
              )}

              {quarantine.state === 'quarantined' && (
                <>
                  <p className="pending-note">Quarantined. Approved by: {quarantine.approvedBy.join(', ')}.</p>
                  <button
                    className="secondary"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => requestLiftQuarantine(health.cellId, operatorId))}
                  >
                    Request lift
                  </button>
                </>
              )}

              {quarantine.state === 'pending_second_approval' && health.status === 'quarantined' && (
                <>
                  <p className="pending-note">Pending lift. Needs a second, distinct operator to approve.</p>
                  <button
                    className="secondary"
                    disabled={busyCellId === health.cellId}
                    onClick={() => withBusy(health.cellId, () => approveLiftQuarantine(health.cellId, operatorId))}
                  >
                    Approve lift
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <section className="panel">
        <h2>Audit trail (FR-25)</h2>
        <table>
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
                <td className="hash">{entry.hash.slice(0, 12)}...</td>
              </tr>
            ))}
            {trail.length === 0 && (
              <tr>
                <td colSpan={6}>No operator actions recorded yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}
