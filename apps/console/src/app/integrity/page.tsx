'use client'

import { useCallback, useEffect, useState } from 'react'
import { fetchAllIntegrity, fetchIntegrity, integrityExportUrl, ApiError } from '@/lib/api'
import type { IntegrityEvidence } from '@/lib/api'
import { Main, Panel, Field, SelectField, Button, Alert, Badge, Skeleton } from '@arka/ui'

/**
 * Screen W6: on-demand ledger integrity verification with export (FR-23).
 * Follows `docs/RUNBOOK.md` P1: select the Cell and the block range (default
 * genesis to head), run verification, export the evidence.
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
    <Main size="dashboard">
      <Panel title="Integrity audit" subtitle="On-demand ledger verification with export (FR-23). See docs/RUNBOOK.md P1.">
        {error && <Alert>{error}</Alert>}
      </Panel>

      {!overview && !error && (
        <div className="ui-grid">
          <Skeleton height="90px" />
          <Skeleton height="90px" />
        </div>
      )}

      <div className="ui-grid">
        {overview?.map((e) => (
          <Panel key={e.cellId} data-testid="cell-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }}>{e.cellId}</span>
              <Badge tone={e.result.ok ? 'success' : 'danger'}>{e.result.ok ? 'clean' : 'broken'}</Badge>
            </div>
            <div className="ui-meta">
              {e.result.records} records · checked {new Date(e.verifiedAt).toLocaleTimeString()}
            </div>
          </Panel>
        ))}
      </div>

      <Panel title="Run a verification">
        <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <SelectField
            id="cell"
            label="Cell"
            value={selectedCellId}
            onChange={(e) => setSelectedCellId(e.target.value)}
            options={(overview ?? []).map((e) => ({ value: e.cellId, label: e.cellId }))}
          />
          <Field
            id="upTo"
            label="Up to block (optional, default genesis to head)"
            inputMode="numeric"
            placeholder="e.g. 100"
            value={upTo}
            onChange={(event) => setUpTo(event.target.value)}
          />
          <Button disabled={busy || !selectedCellId} onClick={runVerification}>
            {busy ? 'Verifying...' : 'Run verification'}
          </Button>
        </div>
      </Panel>

      {evidence && (
        <Panel title={`Evidence: ${evidence.cellId}`}>
          <table className="ui-table ui-table--attributes">
            <tbody>
              <tr>
                <th>Status</th>
                <td data-testid="evidence-status">
                  <Badge tone={evidence.result.ok ? 'success' : 'danger'}>{evidence.result.ok ? 'clean' : 'broken'}</Badge>
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
                <td className="ui-hash">{evidence.result.rootHash ?? '(empty chain)'}</td>
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
          <div style={{ marginTop: 16 }}>
            <a className="ui-button ui-button--primary ui-button--auto" href={integrityExportUrl(evidence.cellId, evidence.upTo ?? undefined)}>
              Export evidence
            </a>
          </div>
        </Panel>
      )}
    </Main>
  )
}
