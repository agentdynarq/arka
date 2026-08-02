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

          <div style={{ padding: '20px 24px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 600, color: '#0F172A' }}>Ledger Verification Architecture</h4>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
              <li style={{ marginBottom: '6px' }}><strong>Append-Only Double-Entry Ledger:</strong> Every transaction generates immutable, hash-chained blocks.</li>
              <li style={{ marginBottom: '6px' }}><strong>Tamper Detection:</strong> Modifying a block breaks subsequent hash signatures instantly.</li>
              <li><strong>Live Replay:</strong> State is reconstructed dynamically by verifying the block sequence.</li>
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
              padding: '16px 20px',
              borderRadius: '10px',
              border: `1.4px solid ${evidence.result.ok ? 'var(--color-banner-success-border)' : 'var(--color-danger)'}`,
              background: evidence.result.ok ? 'var(--color-banner-success-bg)' : 'var(--color-danger-tint)',
              marginBottom: '20px',
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Status</span>
              <span data-testid="evidence-status">
                <Badge tone={evidence.result.ok ? 'success' : 'danger'}>{evidence.result.ok ? 'clean' : 'broken'}</Badge>
              </span>
            </div>

            <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Verified At</span>
              <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#0F172A' }}>{new Date(evidence.verifiedAt).toLocaleTimeString()}</span>
            </div>

            <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Walked Up To</span>
              <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#0F172A' }}>{evidence.upTo ?? 'head'}</span>
            </div>

            <div style={{ padding: '14px 18px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748B' }}>Records</span>
              <span style={{ fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-mono)', color: '#0F172A' }}>{evidence.result.records}</span>
            </div>
          </div>

          <div style={{ padding: '16px 20px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ flex: 1, minWidth: '240px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#64748B', marginBottom: '4px' }}>Root Hash</div>
              <span className="ui-hash" style={{ wordBreak: 'break-all', fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#0F172A' }}>
                {evidence.result.rootHash ?? '(empty chain)'}
              </span>
            </div>
            {evidence.result.rootHash && (
              <button type="button" className="ui-copy-control" onClick={() => copyRootHash(evidence.result.rootHash!)}>
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>

          {!evidence.result.ok && (
            <div style={{ marginTop: '12px', padding: '16px 20px', background: '#FEF2F2', borderRadius: '10px', border: '1px solid #FECACA', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: '#991B1B' }}>Broken at Block {evidence.result.brokenAt}</div>
              <div style={{ fontSize: '13px', color: '#7F1D1D' }}>{evidence.result.reason}</div>
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
