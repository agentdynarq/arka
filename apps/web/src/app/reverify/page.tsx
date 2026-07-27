'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { reVerify, login, verifyMfa, ApiError } from '@/lib/api'
import { storeSession } from '@/lib/session'
import { Main, Panel, Stepper, Field, Button, Alert } from '@arka/ui'

type Step = 're-verify' | 'login' | 'mfa'

const STEP_INDEX: Record<Step, number> = { 're-verify': 0, login: 1, mfa: 2 }

/**
 * Screen W1: regain access. One page, three steps, matching the "done when"
 * bar for 28 July lane B: a seeded customer re-verifies against the
 * preserved registry (FR-01), passes MFA (FR-03), and reaches a real
 * dashboard. Account opening (FR-02) has no screen commitment in this
 * scope; it is a backend capability in `@arka/identity`, exercised directly
 * against the API, not through this UI.
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
    <Main>
      <Panel>
        <Stepper steps={3} current={STEP_INDEX[step]} />

        {error && <Alert>{error}</Alert>}

        {step === 're-verify' && (
          <form onSubmit={handleReVerify}>
            <h1 className="ui-panel__title">Regain access</h1>
            <p className="ui-panel__subtitle">
              Re-verify your identity against the preserved registry before signing in. Liveness check is simulated.
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
              {busy ? 'Verifying...' : 'Re-verify identity'}
            </Button>
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
            <Field
              id="totpCode"
              label="Authentication code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
              hint="Local dev: the identity server logs a fresh valid code to its console on every boot."
              required
            />
            <Button type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify and continue'}
            </Button>
          </form>
        )}
      </Panel>
    </Main>
  )
}
