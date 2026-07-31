'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Button } from '@arka/ui'

const API_BASE = process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:3001'
const TOTP_STEP_SECONDS = 30
const FALLBACK_COMMAND = 'pnpm --filter @arka/identity-app dev'

interface DemoMfaCodeResponse {
  readonly username: string
  readonly code: string
  readonly expiresInSeconds: number
}

type WidgetState = 'loading' | 'live' | 'fallback'

function PhoneGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <line x1="10.3" y1="18.4" x2="13.7" y2="18.4" strokeLinecap="round" />
    </svg>
  )
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])'))
}

interface DemoMfaWidgetProps {
  /** Whichever demo username the surrounding form currently holds (default 'alice'); the code
   *  returned always matches this user's real seeded MFA secret, not a fixed placeholder. */
  readonly username: string
}

/**
 * Judge convenience for the W1 MFA step: previously the only way to get a
 * valid code was reading `apps/identity`'s boot log and restarting the
 * server for a fresh one. This calls the new `GET /v1/auth/demo/mfa-code`
 * endpoint (off by default, `DEMO_MFA_ENDPOINT_ENABLED`), and falls back to
 * the exact restart command if that endpoint 404s (disabled) or is
 * otherwise unreachable, so the widget is never a dead end.
 */
export function DemoMfaWidget({ username }: DemoMfaWidgetProps) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<WidgetState>('loading')
  const [code, setCode] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(TOTP_STEP_SECONDS)
  const [copied, setCopied] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  async function fetchCode() {
    try {
      const response = await fetch(`${API_BASE}/v1/auth/demo/mfa-code?username=${encodeURIComponent(username)}`)
      if (!response.ok) {
        setState('fallback')
        return
      }
      const data: DemoMfaCodeResponse = await response.json()
      setCode(data.code)
      setSecondsLeft(data.expiresInSeconds)
      setState('live')
    } catch {
      setState('fallback')
    }
  }

  function openModal() {
    setState('loading')
    setCopied(false)
    setOpen(true)
    void fetchCode()
  }

  function closeModal() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  // Ticks the rotation countdown while a live code is shown, refetching once
  // it hits the next 30s step so the code shown stays valid the whole time
  // the modal is open, not just at the moment it was first fetched.
  useEffect(() => {
    if (!open || state !== 'live') return
    const interval = setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          void fetchCode()
          return TOTP_STEP_SECONDS
        }
        return seconds - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state])

  // Escape closes, Tab is trapped inside the dialog, focus starts on the
  // first focusable element and returns to the trigger on close.
  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (dialog) focusableElements(dialog)[0]?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = focusableElements(dialog)
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button type="button" ref={triggerRef} onClick={openModal} className="ui-mfa-trigger">
        <PhoneGlyph />
        Check your phone for the code
      </button>

      {open && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="ui-panel"
            style={{ width: '100%', maxWidth: 380 }}
          >
            <h2 id={titleId} className="ui-panel__title" style={{ fontSize: '1.25rem' }}>
              Demo MFA code
            </h2>

            {state === 'loading' && <p className="ui-meta">Fetching a live code...</p>}

            {state === 'live' && code && (
              <>
                <div className="ui-mfa-code" data-testid="demo-mfa-code">
                  {code}
                </div>
                <p className="ui-meta" style={{ marginBottom: 'var(--space-3)' }}>
                  Rotates in {secondsLeft}s
                </p>
                <Button variant="secondary" onClick={() => copyText(code)}>
                  {copied ? 'Copied' : 'Copy code'}
                </Button>
              </>
            )}

            {state === 'fallback' && (
              <>
                <p className="ui-meta">
                  Live retrieval is unavailable right now. Restart the identity server instead; it prints a fresh
                  valid code to its console on boot:
                </p>
                <div className="ui-mfa-code ui-mfa-code--command">{FALLBACK_COMMAND}</div>
                <Button variant="secondary" onClick={() => copyText(FALLBACK_COMMAND)}>
                  {copied ? 'Copied' : 'Copy command'}
                </Button>
              </>
            )}

            <p className="ui-meta" style={{ marginTop: 'var(--space-4)' }}>
              Demo mode only. In production this code reaches your device, never this screen.
            </p>

            <Button variant="ghost" onClick={closeModal} style={{ marginTop: 'var(--space-2)' }}>
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
