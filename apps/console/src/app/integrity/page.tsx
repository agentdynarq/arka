'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchAllIntegrity, fetchIntegrity, integrityExportUrl, ApiError } from '@/lib/api'
import type { IntegrityEvidence } from '@/lib/api'

/**
 * Screen W6: on-demand ledger integrity verification with export (FR-23).
 * Follows `docs/RUNBOOK.md` P1: select the Cell and the block range (default
 * genesis to head), run verification, export the evidence. No Figma file was
 * available for this screen this session, same honesty note as screen W1: a
 * plain functional build of the journey, not a claimed wireframe match.
 */
export default function IntegrityPage() {
  const [overview, setOverview] = useState<IntegrityEvidence[] | null>(null)
  const [selectedCellId, setSelectedCellId] = useState('')
  const [upTo, setUpTo] = useState('')
  const [evidence, setEvidence] = useState<IntegrityEvidence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const loadOverview = useCallback(async () => {
    try {
      const all = await fetchAllIntegrity()
      setOverview(all)
      setSelectedCellId((current) => current || all[0]?.cellId || '')
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the Recovery Console API')
    }
  }, [])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  function parsedUpTo(): number | undefined {
    if (upTo.trim() === '') return undefined
    const value = Number(upTo)
    return Number.isFinite(value) ? value : undefined
  }

  async function runVerification() {
    if (!selectedCellId) return
    setBusy(true)
    setError(null)
    try {
      const result = await fetchIntegrity(selectedCellId, parsedUpTo())
      setEvidence(result)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Integrity audit</h1>
      <p className="subtitle">On-demand ledger verification with export (FR-23). See docs/RUNBOOK.md P1.</p>

      {error && <div className="error">{error}</div>}

      <div className="cell-grid">
        {overview?.map((e) => (
          <div className="cell-card" key={e.cellId}>
            <div className="cell-id">{e.cellId}</div>
            <span className={`status-badge ${e.result.ok ? 'healthy' : 'quarantined'}`}>
              {e.result.ok ? 'clean' : 'broken'}
            </span>
            <div className="meta">
              {e.result.records} records &middot; checked {new Date(e.verifiedAt).toLocaleTimeString()}
            </div>
          </div>
        ))}
        {!overview && !error && <p>Loading integrity overview...</p>}
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <h2>Run a verification</h2>
        <div className="actions" style={{ maxWidth: 420 }}>
          <label>
            Cell
            <select value={selectedCellId} onChange={(e) => setSelectedCellId(e.target.value)}>
              {overview?.map((e) => (
                <option key={e.cellId} value={e.cellId}>
                  {e.cellId}
                </option>
              ))}
            </select>
          </label>
          <label>
            Up to block (optional, default genesis to head)
            <input
              inputMode="numeric"
              placeholder="e.g. 100"
              value={upTo}
              onChange={(event) => setUpTo(event.target.value)}
            />
          </label>
          <button disabled={busy || !selectedCellId} onClick={runVerification}>
            {busy ? 'Verifying...' : 'Run verification'}
          </button>
        </div>
      </section>

      {evidence && (
        <section className="panel">
          <h2>Evidence: {evidence.cellId}</h2>
          <table>
            <tbody>
              <tr>
                <th>Status</th>
                <td>
                  <span className={`status-badge ${evidence.result.ok ? 'healthy' : 'quarantined'}`}>
                    {evidence.result.ok ? 'clean' : 'broken'}
                  </span>
                </td>
              </tr>
              <tr>
                <th>Verified at</th>
                <td>{new Date(evidence.verifiedAt).toLocaleString()}</td>
              </tr>
              <tr>
                <th>Walked up to</th>
                <td>{evidence.upTo ?? 'head'}</td>
              </tr>
              <tr>
                <th>Records</th>
                <td>{evidence.result.records}</td>
              </tr>
              <tr>
                <th>Root hash</th>
                <td className="hash">{evidence.result.rootHash ?? '(empty chain)'}</td>
              </tr>
              {!evidence.result.ok && (
                <>
                  <tr>
                    <th>Broken at</th>
                    <td>block {evidence.result.brokenAt}</td>
                  </tr>
                  <tr>
                    <th>Reason</th>
                    <td>{evidence.result.reason}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
          <p className="actions">
            <a className="link-button" href={integrityExportUrl(evidence.cellId, evidence.upTo ?? undefined)}>
              Export evidence
            </a>
          </p>
        </section>
      )}
    </div>
  )
}
