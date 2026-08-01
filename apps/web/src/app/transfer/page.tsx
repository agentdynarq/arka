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
import { useCellStatus } from '@/lib/cell-status-context'
import { PageHeader, Panel, Field, Button, Alert, Skeleton, OtpInput, Stepper } from '@arka/ui'

type Stage =
  | { name: 'form' }
  | { name: 'step-up'; actionToken: string; idempotencyKey: string; toAccountId: string; amountMinorUnits: string }
  | { name: 'done'; result: Extract<TransferOutcome, { status: 'confirmed' }> }

const STEPS = ['Details', "Confirm it's you", 'Done']

function stepIndex(stage: Stage): number {
  if (stage.name === 'form') return 0
  if (stage.name === 'step-up') return 1
  return 2
}

/**
 * Screen W3, a full page rather than a centred card: form on the left,
 * a live review panel on the right, matching the shell's dashboard-style
 * layout used everywhere else. FR-09 (instant transfer) and FR-04 (step-up
 * on a new payee): step-up now renders as an explicit numbered step inline
 * (the Stepper above), not the old full-screen modal that appeared with no
 * warning.
 *
 * The idempotency key is generated once per transfer intent and reused
 * across the step-up round trip, so completing step-up and retrying is
 * exactly the same request, not a new one: the point of FR-13 is that this
 * is safe to do without risking a double transfer.
 */
export default function TransferPage() {
  const router = useRouter()
  const cellStatus = useCellStatus()
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
      <>
        <PageHeader breadcrumb="Arka / Payments" title="Send money" />
        <Skeleton height="320px" />
      </>
    )
  }

  const fromAccount = dashboard.accounts[0]
  const quarantined = cellStatus?.status === 'quarantined'

  let previewAmountMinorUnits: bigint | null = null
  try {
    if (amount.trim()) previewAmountMinorUnits = BigInt(toMinorUnits(amount))
  } catch {
    previewAmountMinorUnits = null
  }

  async function submitTransfer(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!fromAccount) {
      setError('No account to transfer from')
      return
    }
    if (quarantined) {
      setError(`${cellStatus!.cellId} is quarantined and read-only. Transfers resume once the quarantine is lifted.`)
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
      <>
        <PageHeader breadcrumb="Arka / Payments" title="Send money" />
        <Stepper steps={STEPS} current={2} />
        <Panel title="Transfer confirmed" subtitle={`Ledger block #${stage.result.ledgerBlockSeq}, confirmed immediately.`}>
          <p className="ui-meta">Transfer ID: {stage.result.transferId}</p>
          <Button onClick={() => router.replace('/dashboard')}>Back to dashboard</Button>
        </Panel>
      </>
    )
  }

  const reviewToAccountId = stage.name === 'step-up' ? stage.toAccountId : toAccountId
  const reviewAmount = stage.name === 'step-up' ? BigInt(stage.amountMinorUnits) : previewAmountMinorUnits
  const reviewResultingBalance = fromAccount && reviewAmount !== null ? BigInt(fromAccount.balance) - reviewAmount : null

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Payments"
        title="Send money"
        context={fromAccount ? `From ${fromAccount.displayName}, balance LKR ${formatMinorUnits(fromAccount.balance)}` : undefined}
      />

      {quarantined && (
        <Alert tone="info">
          {cellStatus!.cellId} is quarantined and read-only. Your balance and history are unaffected. Transfers resume when the
          quarantine is lifted.
        </Alert>
      )}

      <Stepper steps={STEPS} current={stepIndex(stage)} />

      <div className="ui-dashboard">
        <Panel className="ui-dashboard__main" title={stage.name === 'step-up' ? "Confirm it's you" : 'Send money'}>
          {error && <Alert>{error}</Alert>}

          {stage.name === 'form' && (
            <form onSubmit={submitTransfer}>
              <Field id="to" label="Pay to (account ID)" value={toAccountId} onChange={(e) => setToAccountId(e.target.value)} placeholder="customer:bob" />
              <Field id="amount" label="Amount (LKR)" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50.00" />
              <Button type="submit" disabled={submitting || quarantined}>
                {submitting ? 'Sending...' : 'Send'}
              </Button>
            </form>
          )}

          {stage.name === 'step-up' && (
            <form onSubmit={submitStepUp}>
              <p className="ui-meta" style={{ marginBottom: 'var(--space-4)' }}>
                {stage.toAccountId} is a new payee for this account, sending LKR {formatMinorUnits(stage.amountMinorUnits)}.
                Enter the code from your authenticator app.
              </p>
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <OtpInput value={totpCode} onChange={setTotpCode} autoFocus />
              </div>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Verifying...' : 'Confirm transfer'}
              </Button>
              <p className="ui-meta" style={{ marginTop: 'var(--space-4)' }}>
                Never share this code. Arka staff will never ask for it.
              </p>
            </form>
          )}

          {stage.name === 'form' && (
            <Button variant="ghost" onClick={() => router.replace('/dashboard')}>
              Cancel
            </Button>
          )}
        </Panel>

        <Panel className="ui-dashboard__rail" title="Review">
          <dl className="ui-cell-panel__attrs">
            <div className="ui-cell-panel__attr">
              <dt>From</dt>
              <dd>{fromAccount?.displayName ?? '-'}</dd>
            </div>
            <div className="ui-cell-panel__attr">
              <dt>To</dt>
              <dd>{reviewToAccountId || '-'}</dd>
            </div>
            <div className="ui-cell-panel__attr">
              <dt>Amount</dt>
              <dd>{reviewAmount !== null ? `LKR ${formatMinorUnits(reviewAmount.toString())}` : '-'}</dd>
            </div>
            <div className="ui-cell-panel__attr">
              <dt>Resulting balance</dt>
              <dd>{reviewResultingBalance !== null ? `LKR ${formatMinorUnits(reviewResultingBalance.toString())}` : '-'}</dd>
            </div>
            <div className="ui-cell-panel__attr">
              <dt>Serving Cell</dt>
              <dd>{cellStatus?.cellId || '-'}</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </>
  )
}
