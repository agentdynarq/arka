'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchAllIntegrity, fetchIntegrity, integrityExportUrl, ApiError } from '@/lib/api'
import type { IntegrityEvidence } from '@/lib/api'
import { Main, Panel, Field, SelectField, Button, Alert, Badge, Skeleton } from '@arka/ui'

/**
 * Screen W6: on-demand ledger integrity verification with export (FR-23).
 * Follows `docs/RUNBOOK.md` P1: select the Cell and the block range (default
 * genesis to head), run verification, export the evidence.
 *
 * Matched to the real Phase 1 wireframe (get_design_context on node 11:2336).
 * The wireframe also shows a "Latest blocks" row of individual block cards
 * and a "Published integrity checkpoints" table with named, scheduled
 * checkpoint IDs (CP-2065-07-22-A style). Neither has a real data source in
 * this build: `LedgerService`'s public API (`services/ledger/src/service.ts`)
 * has no method returning a list of recent blocks, only the aggregate
 * `VerifyResult` this page already uses, and there is no scheduled
 * checkpoint-publishing concept anywhere in the data model, only the
 * on-demand verification already built here. Rather than invent either,
 * this keeps showing the real on-demand verification, restyled to the
 * wireframe's visual language (the chain-verified banner, dark ops cards).
 */
function IntegrityPageInner() {
  const searchParams = useSearchParams()
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
      const preselect = searchParams.get('cell')
      setSelectedCellId((current) => current || (preselect && all.some((e) => e.cellId === preselect) ? preselect : all[0]?.cellId || ''))
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the Recovery Console API')
    }
  }, [searchParams])

  useEffect(() => {
    loadOverview()
  }, [loadOverview])

  const runVerification = useCallback(
    async (cellId: string, upToValue?: number) => {
      if (!cellId) return
      setBusy(true)
      setError(null)
      try {
        const result = await fetchIntegrity(cellId, upToValue)
        setEvidence(result)
      } catch (err) {
        setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'Verification failed')
      } finally {
        setBusy(false)
      }
    },
    []
  )

  // A Cell passed in via ?cell= (screen W5's "Inspect" button) runs its
  // verification immediately rather than waiting for another click, so
  // "Inspect" actually shows something on arrival.
  useEffect(() => {
    const preselect = searchParams.get('cell')
    if (preselect && selectedCellId === preselect) runVerification(preselect)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCellId])

  function parsedUpTo(): number | undefined {
    if (upTo.trim() === '') return undefined
    const value = Number(upTo)
    return Number.isFinite(value) ? value : undefined
  }

  return (
    <Main size="dashboard">
      <Panel title="Ledger integrity" subtitle="On-demand verification with export (FR-23). See docs/RUNBOOK.md P1.">
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
          <Button disabled={busy || !selectedCellId} onClick={() => runVerification(selectedCellId, parsedUpTo())}>
            {busy ? 'Verifying...' : 'Run verification'}
          </Button>
        </div>
      </Panel>

      {evidence && (
        <Panel title={`Evidence: ${evidence.cellId}`}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 16,
              flexWrap: 'wrap',
              padding: 'var(--space-4)',
              borderRadius: 'var(--radius-md)',
              border: `1.4px solid ${evidence.result.ok ? 'var(--color-banner-success-border)' : 'var(--color-danger)'}`,
              background: evidence.result.ok ? 'var(--color-banner-success-bg)' : 'var(--color-danger-tint)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <div>
              <p
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: evidence.result.ok ? 'var(--color-banner-success-text)' : 'var(--color-danger)',
                }}
              >
                {evidence.result.ok
                  ? `Chain verified: ${evidence.result.records.toLocaleString()} records · 0 breaks`
                  : `Chain broken at block ${evidence.result.brokenAt}: ${evidence.result.reason}`}
              </p>
              <p className="ui-meta" style={{ marginTop: 4 }}>
                Balances are computed live from this chain on every read, never cached separately, so there is no stored
                projection to diverge from it.
              </p>
            </div>
            <a
              className="ui-button ui-button--primary ui-button--auto"
              href={integrityExportUrl(evidence.cellId, evidence.upTo ?? undefined)}
              data-testid="evidence-export"
            >
              Export evidence
            </a>
          </div>

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
        </Panel>
      )}
    </Main>
  )
}

export default function IntegrityPage() {
  return (
    <Suspense fallback={<Main size="dashboard" />}>
      <IntegrityPageInner />
    </Suspense>
  )
}
