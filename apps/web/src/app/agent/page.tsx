'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestAgentCash, completeAgentCash, toMinorUnits, ApiError } from '@/lib/api'
import type { AgentCashDirection } from '@/lib/api'
import { isLowBandwidthEnabled, setLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'
import { Main, Panel, Field, SelectField, Button, Alert, OtpInput } from '@arka/ui'

type Stage =
  | { name: 'form' }
  | { name: 'awaiting-otp'; requestId: string; expiresAt: string; idempotencyKey: string }
  | { name: 'done'; transferId: string; ledgerBlockSeq: number }

const DIRECTION_OPTIONS = [
  { value: 'cash_in', label: 'Cash in (customer hands the agent physical cash)' },
  { value: 'cash_out', label: 'Cash out (agent hands the customer physical cash)' },
]

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
      <Main>
        <Panel
          title={`Cash ${direction === 'cash_in' ? 'in' : 'out'} confirmed`}
          subtitle={`Ledger block #${stage.ledgerBlockSeq}, confirmed immediately.`}
        >
          <p className="ui-meta">Transfer ID: {stage.transferId}</p>
          <Button onClick={() => setStage({ name: 'form' })}>Start another</Button>
        </Panel>
      </Main>
    )
  }

  if (stage.name === 'awaiting-otp') {
    return (
      <Main>
        <Panel
          title="Ask the customer for their code"
          subtitle={`An OTP was sent to the customer's own notification inbox, it expires at ${new Date(
            stage.expiresAt
          ).toLocaleTimeString()}. This app never sees it, the customer reads it to you.`}
        >
          {error && <Alert>{error}</Alert>}
          <form onSubmit={submitOtp}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <OtpInput value={otpCode} onChange={setOtpCode} autoFocus />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Confirming...' : 'Confirm'}
            </Button>
          </form>
          <Button variant="ghost" onClick={() => setStage({ name: 'form' })}>
            Cancel
          </Button>
        </Panel>
      </Main>
    )
  }

  return (
    <Main size="wide">
      <Panel title="Agent cash in / cash out" subtitle="FR-16. The customer consents by OTP, sent to their own inbox, never to this screen.">
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submitRequest}>
          <Field id="agentId" label="Agent ID" value={agentId} onChange={(e) => setAgentId(e.target.value)} placeholder="agent:west-01" />
          <Field
            id="agentAccountId"
            label="Agent's cash account"
            value={agentAccountId}
            onChange={(e) => setAgentAccountId(e.target.value)}
            placeholder="agent:west"
          />
          <Field
            id="customerAccountId"
            label="Customer's account"
            value={customerAccountId}
            onChange={(e) => setCustomerAccountId(e.target.value)}
            placeholder="customer:alice"
          />
          <SelectField
            id="direction"
            label="Direction"
            options={DIRECTION_OPTIONS}
            value={direction}
            onChange={(e) => setDirection(e.target.value as AgentCashDirection)}
          />
          <Field id="amount" label="Amount (LKR)" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Requesting...' : 'Request'}
          </Button>
        </form>
      </Panel>

      <Panel title="Low-bandwidth mode" subtitle="FR-15. Keeps the dashboard usable on a slow connection: history loads only your most recent transactions instead of the full ledger. Applies everywhere, remembered on this device.">
        <Button variant="secondary" onClick={toggleLowBandwidth}>
          {lowBandwidth ? 'Turn off low-bandwidth mode' : 'Turn on low-bandwidth mode'}
        </Button>
        <p className="ui-meta" style={{ marginTop: 8 }}>
          Currently {lowBandwidth ? `on, showing ${LOW_BANDWIDTH_HISTORY_LIMIT} lines` : 'off'}.
        </p>
      </Panel>

      <Button variant="ghost" onClick={() => router.push('/dashboard')}>
        Back to dashboard
      </Button>
    </Main>
  )
}
