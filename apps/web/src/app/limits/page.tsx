'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, clearSession } from '@/lib/session'
import {
  fetchDashboard,
  fetchDailyLimit,
  fetchCellStatus,
  formatMinorUnits,
  ApiError,
  type DailyLimit,
} from '@/lib/api'
import { Alert, PageHeader, Panel, ProgressBar, StatusWord } from '@arka/ui'

/**
 * FR-12, the standalone limits screen. Every figure comes from
 * `/v1/payments/limits/:accountId`, which computes spend live from the
 * ledger. Nothing here is a placeholder: with the endpoint down the page
 * says so rather than showing a number that is not real.
 *
 * Money stays in minor units as `bigint` all the way to the string that gets
 * rendered. The progress bar is fed an already-computed integer percentage
 * for the same reason: no float ever touches an amount.
 */
export default function LimitsPage() {
  const router = useRouter()
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [cellId, setCellId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }

    fetchDashboard(accessToken)
      .then((data) => {
        const firstAccount = data.accounts[0]
        if (!firstAccount) {
          setLoading(false)
          return undefined
        }
        setAccountId(firstAccount.accountId)
        return fetchDailyLimit(accessToken, firstAccount.accountId).then((limit) => {
          setDailyLimit(limit)
          setLoading(false)
        })
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load your limits')
        setLoading(false)
        clearSession()
      })

    fetchCellStatus(accessToken)
      .then((status) => setCellId(status.cellId))
      .catch(() => setCellId(null))
  }, [router])

  const spent = dailyLimit ? BigInt(dailyLimit.spentToday) : 0n
  const cap = dailyLimit ? BigInt(dailyLimit.limit) : 0n
  const remaining = cap > spent ? cap - spent : 0n
  const usedPct = cap > 0n ? Number((spent * 100n) / cap) : 0

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Limits"
        title="Account limits"
        context="Cell-enforced transaction caps, computed live from the ledger on every read."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Panel>
        {loading && <p className="ui-meta">Loading your limits...</p>}

        {!loading && !dailyLimit && !error && <p className="ui-meta">This account has no limit record yet.</p>}

        {dailyLimit && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Daily transfer limit</span>
                <span style={{ color: 'var(--ink-soft)', fontSize: '14px' }}>
                  LKR {formatMinorUnits(dailyLimit.spentToday)} / LKR {formatMinorUnits(dailyLimit.limit)}
                </span>
              </div>
              <ProgressBar value={usedPct} max={100} />
              <p style={{ fontSize: '13px', color: 'var(--ink-faint)', marginTop: '6px' }}>
                Spend resets at midnight UTC. Remaining today:{' '}
                <strong>LKR {formatMinorUnits(remaining.toString())}</strong>
              </p>
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '0' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
              <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>Account</div>
                <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)', wordBreak: 'break-all' }}>
                  {accountId ?? '-'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                  The limit applies per account, not per customer
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>Raising the limit</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>Step-up required</span>
                  <StatusWord tone="neutral">Enforced</StatusWord>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                  A change needs a verified step-up proof, never the session token alone
                </div>
              </div>

              <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>Enforcing cell</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--ink)' }}>{cellId ?? '-'}</span>
                  <StatusWord tone="success">Active</StatusWord>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>
                  Checked inside your cell, no cross-cell route exists
                </div>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </>
  )
}
