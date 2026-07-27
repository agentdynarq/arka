'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDashboard, fetchHistory, formatMinorUnits, ApiError } from '@/lib/api'
import type { Dashboard, HistoryLine } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'

/**
 * Screen W2, the end of the W1 journey too: a real dashboard, reading a real
 * balance through `@arka/accounts`, and full transaction history with its
 * ledger confirmation status per line (FR-06, FR-08). Not a placeholder: if
 * the access token is missing, expired, or belongs to a revoked session,
 * this redirects back to `/reverify` instead of rendering anything.
 */
export default function DashboardPage() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [history, setHistory] = useState<HistoryLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }

    fetchDashboard(accessToken)
      .then((data) => {
        setDashboard(data)
        const firstAccount = data.accounts[0]
        if (firstAccount) {
          return fetchHistory(accessToken, firstAccount.accountId).then(setHistory)
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
      <main>
        <div className="panel">
          <div className="error">{error}</div>
          <button className="primary" onClick={() => router.replace('/reverify')}>
            Back to sign in
          </button>
        </div>
      </main>
    )
  }

  if (!dashboard) {
    return (
      <main>
        <div className="panel">
          <p className="subtitle">Loading your dashboard...</p>
        </div>
      </main>
    )
  }

  return (
    <main>
      <div className="panel panel-wide">
        <h1>Welcome back, {dashboard.username}</h1>
        <p className="subtitle">Role: {dashboard.role}</p>

        {dashboard.accounts.length === 0 && <p className="subtitle">No accounts found for this customer.</p>}

        {dashboard.accounts.map((account) => (
          <div className="balance-card" key={account.accountId}>
            <div>{account.displayName}</div>
            <div className="amount">LKR {formatMinorUnits(account.balance)}</div>
            <div className="hint">{account.accountId}</div>
          </div>
        ))}

        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => router.push('/transfer')}>
            Send money
          </button>
        </div>

        <h2 style={{ fontSize: '1rem', marginTop: 32, marginBottom: 8 }}>Transaction history</h2>
        {history === null && <p className="subtitle">Loading history...</p>}
        {history?.length === 0 && <p className="subtitle">No transactions yet.</p>}
        {history?.map((line) => (
          <div key={line.seq} className="history-line">
            <div>
              <div className="history-counterparty">
                {line.direction === 'debit' ? 'To ' : 'From '}
                {line.counterpartyHint}
              </div>
              <div className="hint">{new Date(line.at).toLocaleString()}</div>
            </div>
            <div className="history-amount-block">
              <div className={line.direction === 'debit' ? 'history-amount-out' : 'history-amount-in'}>
                {line.direction === 'debit' ? '-' : '+'}
                {formatMinorUnits(line.amount)}
              </div>
              <div className="hint">{line.confirmed ? 'Ledger confirmed' : 'Pending'}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 24 }}>
          <button className="primary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
