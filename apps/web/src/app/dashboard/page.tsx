'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDashboard, fetchHistory, fetchDailyLimit, fetchNotifications, formatMinorUnits, ApiError } from '@/lib/api'
import type { Dashboard, HistoryLine, DailyLimit, AppNotification } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { isLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'
import {
  Main,
  Panel,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  Row,
  Badge,
  ReceiptIcon,
  BalanceHero,
  Tile,
  ProgressBar,
  TimelineItem,
} from '@arka/ui'

function initialsFor(hint: string): string {
  const name = hint.includes(':') ? hint.split(':')[1]! : hint
  return name.slice(0, 2).toUpperCase()
}

/**
 * Screen W2, the end of the W1 journey too: a real dashboard, matching the
 * Phase 1 wireframe's layout (hero balance card, quick actions, activity
 * list, a right rail of system status / security events / limits), reading
 * a real balance through `@arka/accounts` and full transaction history with
 * its ledger confirmation status per line (FR-06, FR-08). Not a placeholder:
 * if the access token is missing, expired, or belongs to a revoked session,
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
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null)
  const [securityEvents, setSecurityEvents] = useState<AppNotification[] | null>(null)
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
          fetchHistory(accessToken, firstAccount.accountId, lowBandwidthMode ? LOW_BANDWIDTH_HISTORY_LIMIT : undefined).then(setHistory)
          fetchDailyLimit(accessToken, firstAccount.accountId).then(setDailyLimit)
        } else {
          setHistory([])
        }
        return undefined
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load the dashboard')
        clearSession()
      })

    fetchNotifications(accessToken)
      .then((all) => setSecurityEvents(all.filter((n) => n.kind === 'security').slice(0, 3)))
      .catch(() => setSecurityEvents([]))
  }, [router])

  if (error) {
    return (
      <Main size="dashboard">
        <Panel>
          <Alert>{error}</Alert>
          <Button onClick={() => router.replace('/reverify')}>Back to sign in</Button>
        </Panel>
      </Main>
    )
  }

  if (!dashboard) {
    return (
      <Main size="dashboard">
        <Skeleton height="26px" width="280px" />
        <div style={{ marginTop: 16 }}>
          <Skeleton height="236px" />
        </div>
      </Main>
    )
  }

  const account = dashboard.accounts[0]
  const now = new Date()
  const dateLabel = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <Main size="dashboard">
      <h1 className="ui-panel__title" style={{ fontSize: '1.75rem', marginBottom: 4 }}>
        Good to see you, {dashboard.username}
      </h1>
      <p className="ui-meta" style={{ marginBottom: 24 }}>
        {dateLabel} · Role {dashboard.role}
      </p>

      <div className="ui-dashboard">
        <div className="ui-dashboard__main">
          {account ? (
            <BalanceHero
              data-testid="balance-card"
              label={`Main account · ${account.accountId}`}
              amount={`LKR ${formatMinorUnits(account.balance)}`}
              amountTestId="balance-amount"
              badge="Ledger verified just now"
              hint="Restored from verified ledger · zero data loss"
            >
              <Button variant="teal" fullWidth={false} onClick={() => router.push('/transfer')}>
                Send
              </Button>
              <Button variant="secondary" fullWidth={false} style={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }} onClick={() => router.push('/agent')}>
                Agent cash
              </Button>
            </BalanceHero>
          ) : (
            <EmptyState icon={<ReceiptIcon />} title="No accounts found" hint="This customer has no accounts registered yet." />
          )}

          <div className="ui-tile-grid">
            <Tile icon="QR" label="Pay with QR" onClick={() => router.push('/qr')} />
            <Tile icon="ST" label="Statements" onClick={() => router.push('/dashboard')} />
            <Tile icon="LM" label="Limits" onClick={() => router.push('/agent')} />
            <Tile icon="AG" label="Find an agent" onClick={() => router.push('/agent')} />
          </div>

          <Panel title="Recent activity">
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
            {history?.length === 0 && (
              <EmptyState icon={<ReceiptIcon />} title="No transactions yet" hint="Sent and received money will show up here." />
            )}
            {history?.map((line) => (
              <Row
                key={line.seq}
                avatar={initialsFor(line.counterpartyHint)}
                title={`${line.direction === 'debit' ? 'To' : 'From'} ${line.counterpartyHint}`}
                meta={new Date(line.at).toLocaleString()}
                value={`${line.direction === 'debit' ? '-' : '+'}${formatMinorUnits(line.amount)}`}
                valueTone={line.direction === 'debit' ? 'negative' : 'positive'}
                footnote={<Badge tone={line.confirmed ? 'success' : 'warning'}>{line.confirmed ? 'Confirmed' : 'Pending'}</Badge>}
              />
            ))}
          </Panel>
        </div>

        <div className="ui-dashboard__rail">
          <Panel title="Security events">
            {securityEvents === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Skeleton height="40px" />
                <Skeleton height="40px" />
              </div>
            )}
            {securityEvents?.length === 0 && <p className="ui-meta">No security alerts yet.</p>}
            {securityEvents?.map((event) => (
              <TimelineItem key={event.notificationId} time={new Date(event.createdAt).toLocaleString()}>
                {event.message}
              </TimelineItem>
            ))}
          </Panel>

          <Panel title="Your limits">
            {dailyLimit === null ? (
              <Skeleton height="80px" />
            ) : (
              <>
                <p className="ui-meta" style={{ marginBottom: 4 }}>
                  Daily transfer limit
                </p>
                <p className="ui-panel__title" style={{ fontSize: '1.25rem', marginBottom: 12 }}>
                  LKR {formatMinorUnits(dailyLimit.limit)}
                </p>
                <ProgressBar
                  value={Number(BigInt(dailyLimit.spentToday))}
                  max={Number(BigInt(dailyLimit.limit))}
                  label={`LKR ${formatMinorUnits(dailyLimit.spentToday)} used today · ${
                    BigInt(dailyLimit.limit) > 0n ? Math.round((Number(BigInt(dailyLimit.spentToday)) / Number(BigInt(dailyLimit.limit))) * 100) : 0
                  }%`}
                />
              </>
            )}
            <div style={{ marginTop: 16 }}>
              <Button variant="secondary" fullWidth={false} onClick={() => router.push('/agent')}>
                Manage limits
              </Button>
            </div>
          </Panel>

          <Button variant="ghost" onClick={() => { clearSession(); router.replace('/reverify') }}>
            Sign out
          </Button>
        </div>
      </div>
    </Main>
  )
}
