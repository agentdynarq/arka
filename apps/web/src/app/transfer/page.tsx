'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  fetchDashboard,
  transfer,
  requestStepUpChallenge,
  completeStepUp,
  toMinorUnits,
  formatMinorUnits,
  ApiError,
} from '@/lib/api'
import type { Dashboard, TransferOutcome } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { Main, Panel, Field, Button, Alert, Skeleton, OtpInput } from '@arka/ui'

type Stage =
  | { name: 'form' }
  | { name: 'step-up'; actionToken: string; idempotencyKey: string; toAccountId: string; amountMinorUnits: string }
  | { name: 'done'; result: Extract<TransferOutcome, { status: 'confirmed' }> }

/**
 * Screen W3. FR-09 (instant transfer) and FR-04 (step-up on a new payee): a
 * new payee triggers step-up confirmation, and the modal explains why it
 * appeared, per the Phase 1 wireframe.
 *
 * The idempotency key is generated once per transfer intent and reused
 * across the step-up round trip, so completing step-up and retrying is
 * exactly the same request, not a new one: the point of FR-13 is that this
 * is safe to do without risking a double transfer.
 */
export default function TransferPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [toAccountId, setToAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [stage, setStage] = useState<Stage>({ name: 'form' })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/reverify')
      return
    }
    setAccessToken(token)
    fetchDashboard(token)
      .then(setDashboard)
      .catch(() => {
        clearSession()
        router.replace('/reverify')
      })
  }, [router])

  if (!accessToken || !dashboard) {
    return (
      <Main>
        <Panel>
          <Skeleton height="1.4rem" width="50%" />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="44px" />
            <Skeleton height="44px" />
            <Skeleton height="44px" />
          </div>
        </Panel>
      </Main>
    )
  }

  const fromAccount = dashboard.accounts[0]

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!fromAccount) {
      setError('No account to transfer from')
      return
    }

    let amountMinorUnits: string
    try {
      amountMinorUnits = toMinorUnits(amount)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Enter a valid amount')
      return
    }

    const idempotencyKey = crypto.randomUUID()
    setSubmitting(true)
    try {
      const result = await transfer(accessToken!, idempotencyKey, fromAccount.accountId, toAccountId, amountMinorUnits)
      await handleOutcome(result, idempotencyKey, toAccountId, amountMinorUnits)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Transfer failed')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleOutcome(
    result: TransferOutcome,
    idempotencyKey: string,
    toAccountId: string,
    amountMinorUnits: string
  ): Promise<void> {
    if ('stepUpRequired' in result) {
      const challenge = await requestStepUpChallenge(accessToken!, result.reason)
      setStage({ name: 'step-up', actionToken: challenge.actionToken, idempotencyKey, toAccountId, amountMinorUnits })
      return
    }
    setStage({ name: 'done', result })
  }

  async function submitStepUp(event: React.FormEvent) {
    event.preventDefault()
    if (stage.name !== 'step-up') return
    setError(null)
    setSubmitting(true)
    try {
      const proof = await completeStepUp(stage.actionToken, 'new_payee', totpCode)
      const result = await transfer(
        accessToken!,
        stage.idempotencyKey,
        fromAccount!.accountId,
        stage.toAccountId,
        stage.amountMinorUnits,
        proof.stepUpToken
      )
      if ('stepUpRequired' in result) {
        // Should not happen: a completed step-up always satisfies the check
        // that just asked for it. Surfacing rather than looping silently.
        setError('Step-up completed but the transfer still required it. Please retry.')
        setStage({ name: 'form' })
        return
      }
      setStage({ name: 'done', result })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Step-up verification failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (stage.name === 'done') {
    return (
      <Main>
        <Panel title="Transfer confirmed" subtitle={`Ledger block #${stage.result.ledgerBlockSeq}, confirmed immediately.`}>
          <p className="ui-meta">Transfer ID: {stage.result.transferId}</p>
          <Button onClick={() => router.replace('/dashboard')}>Back to dashboard</Button>
        </Panel>
      </Main>
    )
  }

  if (stage.name === 'step-up') {
    return (
      <div className="ui-modal-backdrop">
        <Panel
          title="Confirm it's you"
          subtitle={`${stage.toAccountId} is a new payee for this account, sending LKR ${formatMinorUnits(
            stage.amountMinorUnits
          )}. Enter the code from your authenticator app.`}
        >
          {error && <Alert>{error}</Alert>}
          <form onSubmit={submitStepUp}>
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <OtpInput value={totpCode} onChange={setTotpCode} autoFocus />
            </div>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Verifying...' : 'Confirm transfer'}
            </Button>
          </form>
          <p className="ui-meta" style={{ marginTop: 'var(--space-4)', textAlign: 'center' }}>
            Never share this code. Arka staff will never ask for it.
          </p>
        </Panel>
      </div>
    )
  }

  return (
    <Main>
      <Panel
        title="Send money"
        subtitle={fromAccount ? `From ${fromAccount.displayName}, balance LKR ${formatMinorUnits(fromAccount.balance)}` : undefined}
      >
        {error && <Alert>{error}</Alert>}
        <form onSubmit={submitTransfer}>
          <Field id="to" label="Pay to (account ID)" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} placeholder="customer:bob" />
          <Field id="amount" label="Amount (LKR)" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Sending...' : 'Send'}
          </Button>
        </form>
        <Button variant="ghost" onClick={() => router.replace('/dashboard')}>
          Cancel
        </Button>
      </Panel>
    </Main>
  )
}
