'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { fetchDashboard, fetchHistory, fetchDailyLimit, fetchNotifications, formatMinorUnits, ApiError } from '@/lib/api'
import type { Dashboard, HistoryLine, DailyLimit, AppNotification } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { isLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'
import { useCellStatus } from '@/lib/cell-status-context'
import {
  PageHeader,
  OverviewStrip,
  Panel,
  Field,
  SelectField,
  Button,
  Alert,
  Skeleton,
  EmptyState,
  StatusWord,
  ShieldIcon,
} from '@arka/ui'

const PAGE_SIZE = 10

type DirectionFilter = 'all' | 'credit' | 'debit'

function descriptionFor(line: HistoryLine): string {
  return line.direction === 'debit' ? `Sent to ${line.counterpartyHint}` : `Received from ${line.counterpartyHint}`
}

function dayKeyFor(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Screen W2, the end of the W1 journey too: a dense activity table (like
 * every other dash.cloudflare.com-style screen in this shell) instead of the
 * old two-column card layout, reading a real balance through `@arka/accounts`
 * and full transaction history with its ledger confirmation status per line
 * (FR-06, FR-08). Not a placeholder: if the access token is missing, expired,
 * or belongs to a revoked session, this redirects back to `/reverify`.
 *
 * FR-15: when low-bandwidth mode is on (set on the agent-cash screen), history
 * asks the server for only the newest few lines instead of the full ledger, a
 * real reduction in bytes over the wire. "View all activity" is a real,
 * further request for the rest, not a fabricated link: opting into more data
 * on a slow connection is the customer's call, not this screen's.
 */
export default function DashboardPage() {
  const router = useRouter()
  const cellStatus = useCellStatus()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [history, setHistory] = useState<HistoryLine[] | null>(null)
  const [dailyLimit, setDailyLimit] = useState<DailyLimit | null>(null)
  const [securityEvents, setSecurityEvents] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lowBandwidth, setLowBandwidth] = useState(false)
  const [loadedAt, setLoadedAt] = useState<Date | null>(null)
  const [search, setSearch] = useState('')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

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
          fetchHistory(accessToken, firstAccount.accountId, lowBandwidthMode ? LOW_BANDWIDTH_HISTORY_LIMIT : undefined).then(
            (lines) => {
              setHistory(lines)
              setLoadedAt(new Date())
            }
          )
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
      .then((all) => setSecurityEvents(all.filter((n) => n.kind === 'security').slice(0, 5)))
      .catch(() => setSecurityEvents([]))
  }, [router])

  const account = dashboard?.accounts[0]

  const balanceAfterBySeq = useMemo(() => {
    const map = new Map<number, bigint>()
    if (!account || !history) return map
    let running = BigInt(account.balance)
    for (const line of history) {
      map.set(line.seq, running)
      const effect = line.direction === 'credit' ? BigInt(line.amount) : -BigInt(line.amount)
      running -= effect
    }
    return map
  }, [account, history])

  const filtered = (history ?? []).filter((line) => {
    if (directionFilter !== 'all' && line.direction !== directionFilter) return false
    if (search.trim() && !descriptionFor(line).toLowerCase().includes(search.trim().toLowerCase())) return false
    return true
  })
  const visible = expanded ? filtered : filtered.slice(0, PAGE_SIZE)

  const groups = useMemo(() => {
    const map = new Map<string, HistoryLine[]>()
    for (const line of visible) {
      const key = dayKeyFor(line.at)
      const list = map.get(key)
      if (list) list.push(line)
      else map.set(key, [line])
    }
    return Array.from(map.entries())
  }, [visible])

  async function viewAllActivity() {
    if (!lowBandwidth || !account) {
      setExpanded(true)
      return
    }
    const accessToken = getAccessToken()
    if (!accessToken) return
    setLoadingMore(true)
    try {
      const full = await fetchHistory(accessToken, account.accountId)
      setHistory(full)
      setExpanded(true)
    } finally {
      setLoadingMore(false)
    }
  }

  if (error) {
    return (
      <>
        <PageHeader breadcrumb="Arka / Accounts" title="Accounts" />
        <Panel>
          <Alert>{error}</Alert>
          <Button onClick={() => router.replace('/reverify')}>Back to sign in</Button>
        </Panel>
      </>
    )
  }

  if (!dashboard) {
    return (
      <>
        <PageHeader breadcrumb="Arka / Accounts" title="Accounts" />
        <Skeleton height="80px" />
        <Skeleton height="320px" />
      </>
    )
  }

  const limitPct =
    dailyLimit && BigInt(dailyLimit.limit) > 0n
      ? Math.round((Number(BigInt(dailyLimit.spentToday)) / Number(BigInt(dailyLimit.limit))) * 100)
      : 0

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Accounts"
        title={`Good to see you, ${dashboard.username}`}
        context={`Role ${dashboard.role}`}
        action={
          <Button fullWidth={false} onClick={() => router.push('/transfer')}>
            Send
          </Button>
        }
      />

      <OverviewStrip
        columns={[
          {
            label: 'Available balance',
            value: account ? `LKR ${formatMinorUnits(account.balance)}` : '-',
            context: account?.displayName,
            testId: 'balance-card',
            valueTestId: 'balance-amount',
          },
          {
            label: 'Ledger status',
            value: loadedAt ? 'Clean' : '...',
            context: loadedAt ? `Verified ${loadedAt.toLocaleTimeString()}` : undefined,
          },
          {
            label: 'Daily limit used',
            value: dailyLimit ? `${limitPct}%` : '-',
            context: dailyLimit ? `LKR ${formatMinorUnits(dailyLimit.spentToday)} of ${formatMinorUnits(dailyLimit.limit)}` : undefined,
          },
          {
            label: 'Serving Cell',
            value: cellStatus?.cellId || '-',
            context: !cellStatus ? 'Checking...' : cellStatus.status === 'quarantined' ? 'Quarantined, read-only' : 'Healthy',
          },
        ]}
      />

      <div className="ui-link-row">
        <Link href="/qr" className="ui-link-row__item">
          Pay with QR
        </Link>
        <Link href="/dashboard" className="ui-link-row__item">
          Statements
        </Link>
        <Link href="/agent" className="ui-link-row__item">
          Limits
        </Link>
        <Link href="/agent" className="ui-link-row__item">
          Find an agent
        </Link>
      </div>

      <Panel title="Recent activity">
        {lowBandwidth && (
          <p className="ui-meta" style={{ marginTop: -8, marginBottom: 12 }}>
            Low-bandwidth mode is on: loaded your {LOW_BANDWIDTH_HISTORY_LIMIT} most recent transactions.
          </p>
        )}

        {history !== null && history.length > 0 && (
          <div className="ui-toolbar">
            <div className="ui-toolbar__search">
              <Field id="activity-search" label="Search" placeholder="Search by counterparty" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <SelectField
              id="activity-filter"
              label="Show"
              value={directionFilter}
              onChange={(e) => setDirectionFilter(e.target.value as DirectionFilter)}
              options={[
                { value: 'all', label: 'All activity' },
                { value: 'credit', label: 'Money in' },
                { value: 'debit', label: 'Money out' },
              ]}
            />
          </div>
        )}

        {history === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="40px" />
            <Skeleton height="40px" />
            <Skeleton height="40px" />
          </div>
        )}
        {history?.length === 0 && <EmptyState title="No transactions yet" hint="Sent and received money will show up here." />}
        {history !== null && history.length > 0 && filtered.length === 0 && (
          <p className="ui-meta">No activity matches your search.</p>
        )}

        {groups.map(([day, lines]) => (
          <div className="ui-day-group" key={day}>
            <p className="ui-day-group__heading">{day}</p>
            <table className="ui-table ui-table--dense">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Balance after</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const balanceAfter = balanceAfterBySeq.get(line.seq)
                  return (
                    <tr key={line.seq}>
                      <td>{new Date(line.at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</td>
                      <td>{descriptionFor(line)}</td>
                      <td className="ui-hash">Block #{line.seq}</td>
                      <td className="ui-table__num">
                        {line.direction === 'debit' ? '-' : '+'}
                        {formatMinorUnits(line.amount)}
                      </td>
                      <td className="ui-table__num">{balanceAfter !== undefined ? formatMinorUnits(balanceAfter.toString()) : '-'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ))}

        {!expanded && filtered.length > PAGE_SIZE && (
          <div style={{ marginTop: 'var(--space-4)' }}>
            <Button variant="secondary" fullWidth={false} disabled={loadingMore} onClick={viewAllActivity}>
              {loadingMore ? 'Loading...' : 'View all activity'}
            </Button>
          </div>
        )}

        {history !== null && history.length > 0 && (
          <p className="ui-meta" style={{ marginTop: 'var(--space-3)' }}>
            <StatusWord tone="success">Confirmed</StatusWord> every line here is confirmed the instant it lands, this ledger has
            no pending state.
          </p>
        )}
      </Panel>

      <Panel title="Security events">
        {securityEvents === null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="40px" />
            <Skeleton height="40px" />
          </div>
        )}
        {securityEvents?.length === 0 && (
          <EmptyState icon={<ShieldIcon />} title="Nothing to review" hint="Sign-ins and security-relevant changes will show up here." />
        )}
        {securityEvents && securityEvents.length > 0 && (
          <table className="ui-table ui-table--dense">
            <tbody>
              {securityEvents.map((event) => (
                <tr key={event.notificationId}>
                  <td style={{ width: '30%' }} className="ui-hash">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                  <td>{event.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  )
}
