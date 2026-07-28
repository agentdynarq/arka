'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateQr, redeemQr, toMinorUnits, ApiError } from '@/lib/api'
import { getAccessToken } from '@/lib/session'
import { Main, Panel, Field, Button, Alert } from '@arka/ui'

type GenerateStage = { name: 'form' } | { name: 'ready'; token: string; expiresAt: string }
type RedeemStage = { name: 'form' } | { name: 'done'; transferId: string; ledgerBlockSeq: number }

/**
 * Screen W4's merchant/customer QR pairing (FR-11), the traceability
 * matrix's "Move money safely" capability alongside W2/W3. Two roles on one
 * screen, same shape as agent cash-in/cash-out: a merchant generates a
 * signed, time-bounded code with no login of their own (no merchant
 * identity system exists in this scope, same reason agent cash-in has
 * none), and a customer redeems it against their own signed-in session.
 *
 * There is no camera scan here and no generated barcode image: the signed
 * token is shown as plain text to copy, standing in for what a real QR
 * image would encode. Labelled honestly rather than faked, same principle
 * as `livenessSimulated`.
 */
export default function QrPage() {
  const router = useRouter()
  const [accessToken, setAccessToken] = useState<string | null>(null)

  const [merchantAccountId, setMerchantAccountId] = useState('')
  const [genAmount, setGenAmount] = useState('')
  const [reference, setReference] = useState('')
  const [generateStage, setGenerateStage] = useState<GenerateStage>({ name: 'form' })
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const [customerAccountId, setCustomerAccountId] = useState('')
  const [qrToken, setQrToken] = useState('')
  const [redeemStage, setRedeemStage] = useState<RedeemStage>({ name: 'form' })
  const [redeemError, setRedeemError] = useState<string | null>(null)
  const [redeeming, setRedeeming] = useState(false)

  useEffect(() => {
    const token = getAccessToken()
    if (!token) {
      router.replace('/reverify')
      return
    }
    setAccessToken(token)
  }, [router])

  async function submitGenerate(event: React.FormEvent) {
    event.preventDefault()
    setGenerateError(null)
    let amountMinorUnits: string
    try {
      amountMinorUnits = toMinorUnits(genAmount)
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Enter a valid amount')
      return
    }
    setGenerating(true)
    try {
      const result = await generateQr(merchantAccountId, amountMinorUnits, reference)
      setGenerateStage({ name: 'ready', token: result.token, expiresAt: result.expiresAt })
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Could not generate a QR code')
    } finally {
      setGenerating(false)
    }
  }

  async function submitRedeem(event: React.FormEvent) {
    event.preventDefault()
    if (!accessToken) return
    setRedeemError(null)
    setRedeeming(true)
    try {
      const result = await redeemQr(accessToken, crypto.randomUUID(), customerAccountId, qrToken)
      setRedeemStage({ name: 'done', transferId: result.transferId, ledgerBlockSeq: result.ledgerBlockSeq })
    } catch (err) {
      setRedeemError(err instanceof ApiError ? err.message : 'Could not redeem this QR code')
    } finally {
      setRedeeming(false)
    }
  }

  if (!accessToken) {
    return (
      <Main>
        <Panel>
          <p className="ui-meta">Loading...</p>
        </Panel>
      </Main>
    )
  }

  return (
    <Main size="wide">
      <Panel title="Generate a QR code" subtitle="FR-11. The merchant side. No merchant login in this scope: anyone with a real account id can generate one, the same reason agent cash-in has no agent login.">
        {generateError && <Alert>{generateError}</Alert>}
        {generateStage.name === 'form' ? (
          <form onSubmit={submitGenerate}>
            <Field
              id="merchantAccountId"
              label="Merchant account"
              value={merchantAccountId}
              onChange={(e) => setMerchantAccountId(e.target.value)}
              placeholder="merchant:kade"
            />
            <Field id="genAmount" label="Amount (LKR)" value={genAmount} onChange={(e) => setGenAmount(e.target.value)} placeholder="75.00" />
            <Field id="reference" label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="order-1" />
            <Button type="submit" disabled={generating}>
              {generating ? 'Generating...' : 'Generate QR code'}
            </Button>
          </form>
        ) : (
          <>
            <p className="ui-meta">
              Show this to the customer to scan. Standing in for the QR image itself here: in a real device this would render as
              a barcode, this build shows the same signed token as text so it can be copied straight into the redeem form below.
            </p>
            <div style={{ wordBreak: 'break-all', padding: 'var(--space-3)', background: 'var(--color-bg-canvas)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', margin: 'var(--space-3) 0' }}>
              {generateStage.token}
            </div>
            <p className="ui-meta">Expires at {new Date(generateStage.expiresAt).toLocaleTimeString()}.</p>
            <Button variant="ghost" onClick={() => setGenerateStage({ name: 'form' })}>
              Generate another
            </Button>
          </>
        )}
      </Panel>

      <div style={{ marginTop: 'var(--space-5)' }}>
        {redeemStage.name === 'form' ? (
          <Panel title="Redeem a QR code" subtitle="The customer side. Paste the code a merchant showed you and confirm from your own signed-in account.">
            {redeemError && <Alert>{redeemError}</Alert>}
            <form onSubmit={submitRedeem}>
              <Field
                id="customerAccountId"
                label="Your account"
                value={customerAccountId}
                onChange={(e) => setCustomerAccountId(e.target.value)}
                placeholder="customer:alice"
              />
              <Field
                id="qrToken"
                label="Scanned code"
                value={qrToken}
                onChange={(e) => setQrToken(e.target.value)}
                placeholder="paste the code shown above"
              />
              <Button type="submit" disabled={redeeming}>
                {redeeming ? 'Redeeming...' : 'Pay'}
              </Button>
            </form>
          </Panel>
        ) : (
          <Panel title="Payment confirmed" subtitle={`Ledger block #${redeemStage.ledgerBlockSeq}, confirmed immediately.`}>
            <p className="ui-meta">Transfer ID: {redeemStage.transferId}</p>
            <Button onClick={() => setRedeemStage({ name: 'form' })}>Scan another</Button>
          </Panel>
        )}
      </div>

      <div style={{ marginTop: 'var(--space-5)' }}>
        <Button variant="ghost" onClick={() => router.push('/dashboard')}>
          Back to dashboard
        </Button>
      </div>
    </Main>
  )
}
