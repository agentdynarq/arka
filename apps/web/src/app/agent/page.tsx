'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestAgentCash, completeAgentCash, toMinorUnits, ApiError } from '@/lib/api'
import type { AgentCashDirection } from '@/lib/api'
import { isLowBandwidthEnabled, setLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'

type Stage =
  | { name: 'form' }
  | { name: 'awaiting-otp'; requestId: string; expiresAt: string; idempotencyKey: string }
  | { name: 'done'; transferId: string; ledgerBlockSeq: number }

/**
 * Screen W4, the inclusion surface (FR-16) and the low-bandwidth preference
 * (FR-15): the traceability matrix in docs/ARCHITECTURE.md ties both to this
 * one screen, "reach everyone" being the shared idea behind an agent-assisted
 * transaction and an app that still works on a slow connection.
 *
 * Agent cash-in/cash-out is deliberately unauthenticated end to end, same as
 * the backend: there is no agent login system in scope. The OTP the agent
 * enters here is never fetched by this app, it is read to the agent by the
 * customer, who received it in their own notification inbox.
 */
export default function AgentPage() {
  const router = useRouter()
  const [lowBandwidth, setLowBandwidth] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [agentAccountId, setAgentAccountId] = useState('')
  const [customerAccountId, setCustomerAccountId] = useState('')
  const [direction, setDirection] = useState<AgentCashDirection>('cash_in')
  const [amount, setAmount] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [stage, setStage] = useState<Stage>({ name: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setLowBandwidth(isLowBandwidthEnabled())
  }, [])

  function toggleLowBandwidth() {
    const next = !lowBandwidth
    setLowBandwidthEnabled(next)
    setLowBandwidth(next)
  }

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    let amountMinorUnits: string
    try {
      amountMinorUnits = toMinorUnits(amount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enter a valid amount')
      return
    }

    setSubmitting(true)
    try {
      const result = await requestAgentCash(agentId, agentAccountId, customerAccountId, direction, amountMinorUnits)
      setStage({ name: 'awaiting-otp', requestId: result.requestId, expiresAt: result.expiresAt, idempotencyKey: crypto.randomUUID() })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the request')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitOtp(event: React.FormEvent) {
    event.preventDefault()
    if (stage.name !== 'awaiting-otp') return
    setError(null)
    setSubmitting(true)
    try {
      const result = await completeAgentCash(stage.idempotencyKey, stage.requestId, otpCode)
      setStage({ name: 'done', transferId: result.transferId, ledgerBlockSeq: result.ledgerBlockSeq })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not complete the request')
    } finally {
      setSubmitting(false)
    }
  }

  if (stage.name === 'done') {
    return (
      <main>
        <div className="panel">
          <h1>Cash {direction === 'cash_in' ? 'in' : 'out'} confirmed</h1>
          <p className="subtitle">Ledger block #{stage.ledgerBlockSeq}, confirmed immediately.</p>
          <div className="hint">Transfer ID: {stage.transferId}</div>
          <div style={{ marginTop: 24 }}>
            <button className="primary" onClick={() => setStage({ name: 'form' })}>
              Start another
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (stage.name === 'awaiting-otp') {
    return (
      <main>
        <div className="panel">
          <h1>Ask the customer for their code</h1>
          <p className="subtitle">
            An OTP was sent to the customer&apos;s own notification inbox, it expires at{' '}
            {new Date(stage.expiresAt).toLocaleTimeString()}. This app never sees it, the customer reads it to you.
          </p>
          {error && <div className="error">{error}</div>}
          <form onSubmit={submitOtp}>
            <div className="field">
              <label htmlFor="otp">Customer&apos;s OTP</label>
              <input id="otp" inputMode="numeric" maxLength={6} value={otpCode} onChange={(e) => setOtpCode(e.target.value)} autoFocus />
            </div>
            <button className="primary" type="submit" disabled={submitting}>
              {submitting ? 'Confirming...' : 'Confirm'}
            </button>
          </form>
          <div style={{ marginTop: 16 }}>
            <button
              className="primary"
              style={{ background: 'transparent', color: 'var(--arka-accent)' }}
              onClick={() => setStage({ name: 'form' })}
            >
              Cancel
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ flexDirection: 'column', gap: 16 }}>
      <div className="panel panel-wide">
        <h1>Agent cash in / cash out</h1>
        <p className="subtitle">FR-16. The customer consents by OTP, sent to their own inbox, never to this screen.</p>
        {error && <div className="error">{error}</div>}
        <form onSubmit={submitRequest}>
          <div className="field">
            <label htmlFor="agentId">Agent ID</label>
            <input id="agentId" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent:west-01" />
          </div>
          <div className="field">
            <label htmlFor="agentAccountId">Agent's cash account</label>
            <input id="agentAccountId" value={agentAccountId} onChange={(e) => setAgentAccountId(e.target.value)} placeholder="agent:west" />
          </div>
          <div className="field">
            <label htmlFor="customerAccountId">Customer's account</label>
            <input
              id="customerAccountId"
              value={customerAccountId}
              onChange={(e) => setCustomerAccountId(e.target.value)}
              placeholder="customer:alice"
            />
          </div>
          <div className="field">
            <label htmlFor="direction">Direction</label>
            <select
              id="direction"
              value={direction}
              onChange={(e) => setDirection(e.target.value as AgentCashDirection)}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--arka-border)', borderRadius: 8, fontSize: '1rem' }}
            >
              <option value="cash_in">Cash in (customer hands the agent physical cash)</option>
              <option value="cash_out">Cash out (agent hands the customer physical cash)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="amount">Amount (LKR)</label>
            <input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          </div>
          <button className="primary" type="submit" disabled={submitting}>
            {submitting ? 'Requesting...' : 'Request'}
          </button>
        </form>
      </div>

      <div className="panel panel-wide">
        <h1 style={{ fontSize: '1.1rem' }}>Low-bandwidth mode</h1>
        <p className="subtitle">
          FR-15. Keeps the dashboard usable on a slow connection: history loads only your {LOW_BANDWIDTH_HISTORY_LIMIT} most
          recent transactions instead of the full ledger. Applies everywhere, remembered on this device.
        </p>
        <button className="primary" onClick={toggleLowBandwidth}>
          {lowBandwidth ? 'Turn off low-bandwidth mode' : 'Turn on low-bandwidth mode'}
        </button>
        <div className="hint" style={{ marginTop: 8 }}>Currently {lowBandwidth ? 'on' : 'off'}.</div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button className="primary" style={{ background: 'transparent', color: 'var(--arka-accent)' }} onClick={() => router.push('/dashboard')}>
          Back to dashboard
        </button>
      </div>
    </main>
  )
}
