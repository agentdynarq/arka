'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDashboard, fetchHistory, formatMinorUnits, ApiError } from '@/lib/api'
import type { Dashboard, HistoryLine } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { isLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'
import { Main, Panel, Button, Alert, Skeleton, EmptyState, Row, Badge, ReceiptIcon } from '@arka/ui'

/**
 * Screen W2, the end of the W1 journey too: a real dashboard, reading a real
 * balance through `@arka/accounts`, and full transaction history with its
 * ledger confirmation status per line (FR-06, FR-08). Not a placeholder: if
 * the access token is missing, expired, or belongs to a revoked session,
 * this redirects back to `/reverify` instead of rendering anything.
 *
 * FR-15: when low-bandwidth mode is on (set on screen W4), history asks the
 * server for only the newest few lines instead of the full ledger, a real
 * reduction in bytes over the wire, not a cosmetic change.
 */
export default function DashboardPage() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [history, setHistory] = useState<HistoryLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lowBandwidth, setLowBandwidth] = useState(false)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }

    const lowBandwidthMode = isLowBandwidthEnabled()
    setLowBandwidth(lowBandwidthMode)

    fetchDashboard(accessToken)
      .then((data) => {
        setDashboard(data)
        const firstAccount = data.accounts[0]
        if (firstAccount) {
          return fetchHistory(accessToken, firstAccount.accountId, lowBandwidthMode ? LOW_BANDWIDTH_HISTORY_LIMIT : undefined).then(
            setHistory
          )
        }
        setHistory([])
        return undefined
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load the dashboard')
        clearSession()
      })
  }, [router])

  function signOut() {
    clearSession()
    router.replace('/reverify')
  }

  if (error) {
    return (
      <Main size="wide">
        <Panel>
          <Alert>{error}</Alert>
          <Button onClick={() => router.replace('/reverify')}>Back to sign in</Button>
        </Panel>
      </Main>
    )
  }

  if (!dashboard) {
    return (
      <Main size="wide">
        <Panel>
          <Skeleton height="1.4rem" width="60%" />
          <div style={{ marginTop: 16 }}>
            <Skeleton height="88px" />
          </div>
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="52px" />
            <Skeleton height="52px" />
            <Skeleton height="52px" />
          </div>
        </Panel>
      </Main>
    )
  }

  return (
    <Main size="wide">
      <Panel title={`Welcome back, ${dashboard.username}`} subtitle={`Role: ${dashboard.role}`}>
        {dashboard.accounts.length === 0 && (
          <EmptyState icon={<ReceiptIcon />} title="No accounts found" hint="This customer has no accounts registered yet." />
        )}

        {dashboard.accounts.map((account) => (
          <div key={account.accountId} className="ui-panel" style={{ marginBottom: 16, boxShadow: 'none' }}>
            <div className="ui-meta">{account.displayName}</div>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-accent)' }}>
              LKR {formatMinorUnits(account.balance)}
            </div>
            <div className="ui-meta">{account.accountId}</div>
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <Button onClick={() => router.push('/transfer')}>Send money</Button>
          <Button variant="secondary" onClick={() => router.push('/agent')}>
            Agent cash / settings
          </Button>
        </div>
      </Panel>

      <Panel title="Transaction history">
        {lowBandwidth && (
          <p className="ui-meta" style={{ marginTop: -8, marginBottom: 12 }}>
            Low-bandwidth mode is on: showing your {LOW_BANDWIDTH_HISTORY_LIMIT} most recent transactions.
          </p>
        )}
        {history === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="52px" />
            <Skeleton height="52px" />
            <Skeleton height="52px" />
          </div>
        )}
        {history?.length === 0 && <EmptyState icon={<ReceiptIcon />} title="No transactions yet" hint="Sent and received money will show up here." />}
        {history?.map((line) => (
          <Row
            key={line.seq}
            title={`${line.direction === 'debit' ? 'To' : 'From'} ${line.counterpartyHint}`}
            meta={new Date(line.at).toLocaleString()}
            value={`${line.direction === 'debit' ? '-' : '+'}${formatMinorUnits(line.amount)}`}
            valueTone={line.direction === 'debit' ? 'negative' : 'positive'}
            footnote={<Badge tone={line.confirmed ? 'success' : 'warning'}>{line.confirmed ? 'Ledger confirmed' : 'Pending'}</Badge>}
          />
        ))}
      </Panel>

      <Button variant="ghost" onClick={signOut}>
        Sign out
      </Button>
    </Main>
  )
}
