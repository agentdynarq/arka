'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { reVerify, login, verifyMfa, ApiError } from '@/lib/api'
import { storeSession } from '@/lib/session'

type Step = 're-verify' | 'login' | 'mfa'

/**
 * Screen W1: regain access. One page, three steps, matching the "done when"
 * bar for 28 July lane B: a seeded customer re-verifies against the
 * preserved registry (FR-01), passes MFA (FR-03), and reaches a real
 * dashboard. Account opening (FR-02) has no screen commitment in this
 * scope; it is a backend capability in `@arka/identity`, exercised directly
 * against the API, not through this UI.
 *
 * No Figma file was available in this session to match the Phase 1
 * wireframe pixel-for-pixel, so this is a plain functional build of the
 * same three-step journey rather than a claimed wireframe match: honest
 * about what it is, same principle as `livenessSimulated`.
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
    <main>
      <div className="panel">
        <div className="stepper">
          <div className={`dot ${step === 're-verify' ? 'active' : 'done'}`} />
          <div className={`dot ${step === 'login' ? 'active' : step === 'mfa' ? 'done' : ''}`} />
          <div className={`dot ${step === 'mfa' ? 'active' : ''}`} />
        </div>

        {error && <div className="error">{error}</div>}

        {step === 're-verify' && (
          <form onSubmit={handleReVerify}>
            <h1>Regain access</h1>
            <p className="subtitle">
              Re-verify your identity against the preserved registry before signing in. Liveness check is simulated.
            </p>
            <div className="field">
              <label htmlFor="customerId">Customer ID</label>
              <input id="customerId" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="registryDocumentId">Registry document ID</label>
              <input
                id="registryDocumentId"
                value={registryDocumentId}
                onChange={(e) => setRegistryDocumentId(e.target.value)}
                required
              />
            </div>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Re-verify identity'}
            </button>
          </form>
        )}

        {step === 'login' && (
          <form onSubmit={handleLogin}>
            <h1>Sign in</h1>
            <p className="subtitle">Identity re-verified. Enter your credentials to continue.</p>
            <div className="field">
              <label htmlFor="username">Username</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={handleMfa}>
            <h1>Verify your identity</h1>
            <p className="subtitle">Enter the 6-digit code from your authenticator app.</p>
            <div className="field">
              <label htmlFor="totpCode">Authentication code</label>
              <input
                id="totpCode"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                required
              />
              <p className="hint">Local dev: the identity server logs a fresh valid code to its console on every boot.</p>
            </div>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Verifying...' : 'Verify and continue'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
