'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAccessToken } from '@/lib/session'
import { PageHeader, Panel, ProgressBar, StatusWord } from '@arka/ui'

export default function LimitsPage() {
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

  if (loading) return null

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Limits"
        title="Account Limits"
        context="Cell-enforced transaction caps, daily quotas, and security thresholds."
      />

      <Panel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Daily Transfer Limit</span>
              <span style={{ color: 'var(--ink-soft)', fontSize: '14px' }}>LKR 45,000 / LKR 500,000</span>
            </div>
            <ProgressBar value={45000} max={500000} />
            <p style={{ fontSize: '13px', color: 'var(--ink-faint)', marginTop: '6px' }}>
              Resets daily at 00:00 UTC. Remaining quota: <strong>LKR 455,000.00</strong>
            </p>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '0' }} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>Per-Transfer Maximum</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink)' }}>LKR 100,000.00</div>
              <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>Max single transaction size</div>
            </div>

            <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>MFA Step-Up Trigger</div>
              <div style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink)' }}>LKR 25,000.00</div>
              <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>Requires TOTP verification</div>
            </div>

            <div style={{ padding: '16px', background: 'var(--ground)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: '4px' }}>Security Clearance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span style={{ fontSize: '20px', fontWeight: 600, color: 'var(--ink)' }}>Tier 2 Verified</span>
                <StatusWord tone="success">Active</StatusWord>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink-faint)', marginTop: '4px' }}>Cell-isolated account</div>
            </div>
          </div>
        </div>
      </Panel>
    </>
  )
}
