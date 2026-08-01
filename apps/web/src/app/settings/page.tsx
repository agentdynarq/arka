'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken, clearSession } from '@/lib/session'
import { PageHeader, Panel, StatusWord, Button } from '@arka/ui'

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }
    setLoading(false)
  }, [router])

  function handleSignOut() {
    clearSession()
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {}
    window.location.replace('/reverify')
  }

  if (loading) return null

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Settings"
        title="Account Settings"
        context="Security preferences, cell isolation status, and authentication controls."
      />

      <Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Security & MFA */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
              Security & Authentication
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Multi-Factor Authentication (MFA)</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>TOTP authenticator app enabled</div>
                </div>
                <StatusWord tone="positive">Enabled</StatusWord>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Workload Identity Protocol</div>
                  <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Short-lived mTLS token verification</div>
                </div>
                <StatusWord tone="neutral">Enforced</StatusWord>
              </div>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '0' }} />

          {/* Cell & Data Isolation */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
              Cell Architecture & Privacy
            </h3>
            <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Cell Isolation Protocol</span>
                <StatusWord tone="positive">Active</StatusWord>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--ink-soft)', lineHeight: 1.5, margin: 0 }}>
                Your financial ledger and personal data are strictly isolated inside your Cell. No cross-cell routes or shared databases exist.
              </p>
            </div>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '0' }} />

          {/* Session Actions */}
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', marginBottom: '12px' }}>
              Session Management
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>Active Browser Session</div>
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>Purge local credentials and return to sign-in</div>
              </div>
              <Button variant="danger" fullWidth={false} onClick={handleSignOut}>
                End Session
              </Button>
            </div>
          </div>
        </div>
      </Panel>
    </>
  )
}
