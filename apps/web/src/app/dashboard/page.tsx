'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDashboard, formatMinorUnits, ApiError } from '@/lib/api'
import type { Dashboard } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'

/**
 * The end of the W1 journey: a real dashboard, reading a real balance
 * through `@arka/accounts` via `@arka/identity-app`'s bearer-guarded
 * endpoint. Not a placeholder: if the access token is missing, expired, or
 * belongs to a revoked session, this redirects back to `/reverify` instead
 * of rendering anything.
 */
export default function DashboardPage() {
  const router = useRouter()
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }

    fetchDashboard(accessToken)
      .then(setDashboard)
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
      <div className="panel">
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

        <div style={{ marginTop: 24 }}>
          <button className="primary" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </main>
  )
}
