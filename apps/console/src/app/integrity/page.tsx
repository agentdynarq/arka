'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { fetchAllIntegrity, fetchIntegrity, integrityExportUrl, ApiError } from '@/lib/api'
import type { IntegrityEvidence } from '@/lib/api'
import { PageHeader, Panel, Field, SelectField, Button, Alert, Badge, Skeleton } from '@arka/ui'

/**
 * Screen W6: on-demand ledger integrity verification with export (FR-23).
 * Follows `docs/RUNBOOK.md` P1: select the Cell and the block range (default
 * genesis to head), run verification, export the evidence.
 *
 * The wireframe also shows a "Latest blocks" row of individual block cards
 * and a "Published integrity checkpoints" table with named, scheduled
 * checkpoint IDs (CP-2065-07-22-A style). Neither has a real data source in
 * this build: `LedgerService`'s public API has no method returning a list of
 * recent blocks, only the aggregate `VerifyResult` this page already uses,
 * and there is no scheduled checkpoint-publishing concept anywhere in the
 * data model. Rather than invent either, this keeps the real on-demand
 * verification, its overview chips now the same status-block shape as W5's
 * Cell panels (lane-c/app-shell), not a separate visual language.
 */
function IntegrityPageInner() {
  const searchParams = useSearchParams()
  const [overview, setOverview] = useState<IntegrityEvidence[] | null>(null)
  const [selectedCellId, setSelectedCellId] = useState('')
  const [upTo, setUpTo] = useState('')
  const [evidence, setEvidence] = useState<IntegrityEvidence | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  function copyRootHash(hash: string) {
    navigator.clipboard.writeText(hash).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
    <>
      <PageHeader breadcrumb="Arka / Integrity audit" title="Ledger integrity" context="On-demand verification with export (FR-23). See docs/RUNBOOK.md P1." />

      {error && <Alert>{error}</Alert>}

      {!overview && !error && (
        <div className="ui-cell-panels">
          <Skeleton height="180px" />
          <Skeleton height="180px" />
        </div>
      )}

      <div className="ui-cell-panels">
        {overview?.map((e) => (
          <div className="ui-panel ui-cell-panel" key={e.cellId} data-testid="cell-card">
            <div className="ui-cell-panel__header">
              <span className="ui-cell-panel__id">{e.cellId}</span>
              <Badge tone={e.result.ok ? 'success' : 'danger'}>{e.result.ok ? 'clean' : 'broken'}</Badge>
            </div>
            <dl className="ui-cell-panel__attrs">
              <div className="ui-cell-panel__attr">
                <dt>Records</dt>
                <dd>{e.result.records.toLocaleString()}</dd>
              </div>
              <div className="ui-cell-panel__attr">
                <dt>Checked</dt>
                <dd>{new Date(e.verifiedAt).toLocaleTimeString()}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>

      <Panel title="Run a verification" subtitle="Walk the hash chain block-by-block to detect any tampering or broken cryptographic links.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '32px', alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            <div style={{ marginTop: '8px' }}>
              <Button disabled={busy || !selectedCellId} onClick={() => runVerification(selectedCellId, parsedUpTo())}>
                {busy ? 'Verifying...' : 'Run verification'}
              </Button>
            </div>
          </div>

          <div className="ui-tile">
            <div className="ui-tile__heading">Ledger verification architecture</div>
            <ul className="ui-tile__body" style={{ paddingLeft: 'var(--space-4)' }}>
              <li style={{ marginBottom: 'var(--space-1)' }}>
                <strong>Append-only double-entry ledger:</strong> every transaction generates immutable, hash-chained blocks.
              </li>
              <li style={{ marginBottom: 'var(--space-1)' }}>
                <strong>Tamper detection:</strong> modifying a block breaks every subsequent hash.
              </li>
              <li>
                <strong>Live replay:</strong> state is reconstructed by verifying the block sequence, never read from a cache.
              </li>
            </ul>
          </div>
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
              padding: 'var(--space-4) var(--space-5)',
              borderRadius: 'var(--radius-md)',
              border: `1.4px solid ${evidence.result.ok ? 'var(--color-banner-success-border)' : 'var(--color-danger)'}`,
              background: evidence.result.ok ? 'var(--color-banner-success-bg)' : 'var(--color-danger-tint)',
              marginBottom: 'var(--space-5)',
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
                  ? `Chain verified: ${evidence.result.records.toLocaleString()} records, 0 breaks`
                  : `Chain broken at block ${evidence.result.brokenAt}: ${evidence.result.reason}`}
              </p>
              <p className="ui-meta" style={{ marginTop: 4 }}>
                Balances are computed live from this chain on every read, never cached separately, so there is no stored projection to diverge from it.
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

          <div className="ui-grid" style={{ marginBottom: 'var(--space-3)' }}>
            <div className="ui-tile ui-tile--split">
              <span className="ui-tile__label">Status</span>
              <span data-testid="evidence-status">
                <Badge tone={evidence.result.ok ? 'success' : 'danger'}>{evidence.result.ok ? 'clean' : 'broken'}</Badge>
              </span>
            </div>

            <div className="ui-tile ui-tile--split">
              <span className="ui-tile__label">Verified at</span>
              <span className="ui-tile__value ui-tile__value--mono">{new Date(evidence.verifiedAt).toLocaleTimeString()}</span>
            </div>

            <div className="ui-tile ui-tile--split">
              <span className="ui-tile__label">Walked up to</span>
              <span className="ui-tile__value ui-tile__value--mono">{evidence.upTo ?? 'head'}</span>
            </div>

            <div className="ui-tile ui-tile--split">
              <span className="ui-tile__label">Records</span>
              <span className="ui-tile__value ui-tile__value--mono">{evidence.result.records}</span>
            </div>
          </div>

          <div className="ui-tile ui-tile--split">
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div className="ui-tile__label">Root hash</div>
              <span className="ui-hash ui-tile__value ui-tile__value--mono">{evidence.result.rootHash ?? '(empty chain)'}</span>
            </div>
            {evidence.result.rootHash && (
              <button type="button" className="ui-copy-control" onClick={() => copyRootHash(evidence.result.rootHash!)}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          {!evidence.result.ok && (
            <div className="ui-tile ui-tile--danger" style={{ marginTop: 'var(--space-3)' }}>
              <div className="ui-tile__heading">Broken at block {evidence.result.brokenAt}</div>
              <p className="ui-tile__body">{evidence.result.reason}</p>
            </div>
          )}
        </Panel>
      )}
    </>
  )
}

export default function IntegrityPage() {
  return (
    <Suspense fallback={<Skeleton height="200px" />}>
      <IntegrityPageInner />
    </Suspense>
  )
}
