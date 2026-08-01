'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestAgentCash, completeAgentCash, toMinorUnits, ApiError } from '@/lib/api'
import type { AgentCashDirection } from '@/lib/api'
import { isLowBandwidthEnabled, setLowBandwidthEnabled, LOW_BANDWIDTH_HISTORY_LIMIT } from '@/lib/low-bandwidth'
import { PageHeader, Panel, Field, SelectField, Button, Alert, OtpInput } from '@arka/ui'

type Stage =
  | { name: 'form' }
  | { name: 'awaiting-otp'; requestId: string; expiresAt: string; idempotencyKey: string }
  | { name: 'done'; transferId: string; ledgerBlockSeq: number }

const DIRECTION_OPTIONS = [
  { value: 'cash_in', label: 'Cash in (customer hands the agent physical cash)' },
  { value: 'cash_out', label: 'Cash out (agent hands the customer physical cash)' },
]

/**
 * Screen W4's agent-cash half (FR-16) plus the low-bandwidth preference
 * (FR-15): the traceability matrix in docs/ARCHITECTURE.md ties both to this
 * one screen, "reach everyone" being the shared idea behind an
 * agent-assisted transaction and an app that still works on a slow
 * connection.
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
      <>
        <PageHeader breadcrumb="Arka / Agent cash" title="Agent cash" />
        <Panel
          title={`Cash ${direction === 'cash_in' ? 'in' : 'out'} confirmed`}
          subtitle={`Ledger block #${stage.ledgerBlockSeq}, confirmed immediately.`}
        >
          <p className="ui-meta">Transfer ID: {stage.transferId}</p>
          <Button onClick={() => setStage({ name: 'form' })}>Start another</Button>
        </Panel>
      </>
    )
  }

  if (stage.name === 'awaiting-otp') {
    return (
      <>
        <PageHeader breadcrumb="Arka / Agent cash" title="Agent cash" />
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
      </>
    )
  }

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Agent cash"
        title="Agent cash"
        context="The customer consents by OTP, sent to their own notification inbox, never to this screen."
      />
      <p className="ui-meta">FR-16</p>

      <div className="ui-dashboard">
        <Panel className="ui-dashboard__main" title="Cash in / cash out">
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

        <Panel className="ui-dashboard__rail" title="How this works">
          <ol style={{ margin: 0, paddingLeft: '1.1em', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <li className="ui-meta">The agent starts a request with the direction and amount.</li>
            <li className="ui-meta">Arka sends a one-time code to the customer's own notification inbox, never to the agent.</li>
            <li className="ui-meta">The customer reads the code aloud to the agent.</li>
            <li className="ui-meta">The agent enters it here to confirm. The transfer settles on the ledger immediately.</li>
          </ol>
        </Panel>
      </div>

      <Panel>
        <div className="ui-toggle-row" style={{ paddingTop: 0, borderTop: 'none' }}>
          <div>
            <p className="ui-toggle-row__label">Low-bandwidth mode</p>
            <p className="ui-toggle-row__hint">
              Loads only your most recent transactions instead of the full ledger. Applies everywhere, remembered on this
              device. Currently {lowBandwidth ? `on, showing ${LOW_BANDWIDTH_HISTORY_LIMIT} lines` : 'off'}.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={lowBandwidth}
            aria-label="Low-bandwidth mode"
            className="ui-toggle"
            data-on={lowBandwidth}
            onClick={toggleLowBandwidth}
          >
            <span className="ui-toggle__thumb" />
          </button>
        </div>
        <p className="ui-meta" style={{ marginTop: 'var(--space-2)' }}>
          FR-15
        </p>
      </Panel>

      <Button variant="ghost" onClick={() => router.push('/dashboard')}>
        Back to dashboard
      </Button>
    </>
  )
}
