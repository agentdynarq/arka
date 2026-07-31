'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { reVerify, login, verifyMfa, ApiError } from '@/lib/api'
import { storeSession } from '@/lib/session'
import { SplitHero, Stepper, Field, Button, Alert, OtpInput } from '@arka/ui'
import { DemoMfaWidget } from '@/components/DemoMfaWidget'

type Step = 're-verify' | 'login' | 'mfa'

const STEP_LABELS = ['Verify identity', 'Sign in', 'Confirm access']
const STEP_INDEX: Record<Step, number> = { 're-verify': 0, login: 1, mfa: 2 }

const BULLETS = [
  {
    title: 'Your records survived',
    description: 'Customer data was preserved in secure backups. Nothing about you was lost.',
  },
  {
    title: 'Verified ledger',
    description: 'Every balance is restored from a tamper-evident ledger and verified before you see it.',
  },
  {
    title: 'No master key',
    description: 'No single secret controls this bank anymore. Recovery requires independent keyholders.',
  },
]

/**
 * Screen W1: regain access. Matches the Phase 1 wireframe's split layout
 * (figma.com/design/SfK9xpHnONjJvRcfbLt8Av): a dark trust panel beside the
 * live form. Three steps, matching the "done when" bar for 28 July lane B:
 * a seeded customer re-verifies against the preserved registry (FR-01),
 * passes MFA (FR-03), and reaches a real dashboard.
 *
 * The wireframe's step 1 fields (NIC, mobile, email) assume a different
 * backend matching model than what FR-01 actually implements here
 * (customerId plus registryDocumentId, see apps/identity's ReVerifyController).
 * The visual treatment matches the wireframe; the fields stay bound to the
 * real API rather than fields that would look right but not work.
 */
export default function ReVerifyPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('re-verify')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [customerId, setCustomerId] = useState('cust-alice')
  const [registryDocumentId, setRegistryDocumentId] = useState('DOC-ALICE-001')

  const [username, setUsername] = useState('alice')
  const [password, setPassword] = useState('')

  const [mfaToken, setMfaToken] = useState('')
  const [totpCode, setTotpCode] = useState('')

  async function handleReVerify(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const result = await reVerify(customerId, registryDocumentId)
      if (!result.verified) {
        setError('Identity could not be re-verified against the preserved registry. Check the customer id and document id.')
        return
      }
      setStep('login')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Re-verification failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const challenge = await login(username, password)
      setMfaToken(challenge.mfaToken)
      setStep('mfa')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const session = await verifyMfa(mfaToken, totpCode)
      storeSession(session.accessToken, session.refreshToken)
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'MFA verification failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SplitHero
      tagline="Banking that survives."
      headline={
        <>
          Your money is intact.
          <br />
          Let&apos;s get you back to it.
        </>
      }
      bullets={BULLETS}
      footer="ARKA · CELL-ISOLATED BANKING PLATFORM"
    >
      <div style={{ width: '100%', maxWidth: 460 }}>
        <p className="ui-panel__eyebrow">RESTORE ACCESS</p>
        <Stepper steps={STEP_LABELS} current={STEP_INDEX[step]} />

        {error && <Alert>{error}</Alert>}

        {step === 're-verify' && (
          <form onSubmit={handleReVerify}>
            <h1 className="ui-panel__title">Re-verify your identity</h1>
            <p className="ui-panel__subtitle">
              We match you against the preserved customer registry. Liveness check is simulated.
            </p>
            <Field id="customerId" label="Customer ID" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required />
            <Field
              id="registryDocumentId"
              label="Registry document ID"
              value={registryDocumentId}
              onChange={(e) => setRegistryDocumentId(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Continue to sign in'}
            </Button>
            <p className="ui-meta" style={{ marginTop: 'var(--space-4)' }}>
              Having trouble? Visit an authorized agent with your NIC and we will verify you in person.
            </p>
          </form>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin}>
            <h1 className="ui-panel__title">Sign in</h1>
            <p className="ui-panel__subtitle">Identity re-verified. Enter your credentials to continue.</p>
            <Field id="username" label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <Field
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMfa}>
            <h1 className="ui-panel__title">Verify your identity</h1>
            <p className="ui-panel__subtitle">Enter the 6-digit code from your authenticator app.</p>
            <div style={{ marginBottom: 'var(--space-2)' }}>
              <OtpInput value={totpCode} onChange={setTotpCode} autoFocus />
            </div>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <DemoMfaWidget username={username} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify and continue'}
            </Button>
          </form>
        )}

        <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-6)', paddingTop: 'var(--space-4)' }}>
          <span className="ui-meta">Secured with TLS 1.3 · protected by step-up authentication</span>
        </div>
      </div>
    </SplitHero>
  )
}
