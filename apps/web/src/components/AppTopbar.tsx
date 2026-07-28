'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Topbar, Button, Badge } from '@arka/ui'
import { getAccessToken, clearSession } from '@/lib/session'

/** @arka/ui's `TopbarLink` is a plain `<a>`, framework-agnostic by design. Next apps want client-side
 *  routing, so this wraps `next/link` in the same CSS class instead of importing the component. */
function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className="ui-topbar__link" data-active={active ? 'true' : undefined}>
      {children}
    </Link>
  )
}

/**
 * The persistent chrome every screen renders under. Previously each page was
 * a lone centred card with no way to get anywhere else; this is what turns
 * W1 through W4 into one app instead of four disconnected forms.
 *
 * Session-aware, not route-gated: `getAccessToken()` is sessionStorage, read
 * only after mount to avoid a server/client hydration mismatch, same
 * pattern every page here already uses for the same reason.
 */
export function AppTopbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    setSignedIn(getAccessToken() !== null)
  }, [pathname])

  function signOut() {
    clearSession()
    router.push('/reverify')
  }

  // Screen W1 (re-verify, the only unauthenticated screen) is a full-bleed
  // split panel with its own brand mark in the wireframe, no persistent
  // topbar above it. Every other screen requires a session, so "not signed
  // in" and "on W1" are effectively the same condition.
  if (!signedIn) return null

  return (
    <Topbar brand="Arka">
      <NavLink href="/dashboard" active={pathname === '/dashboard'}>
        Home
      </NavLink>
      <NavLink href="/transfer" active={pathname === '/transfer'}>
        Payments
      </NavLink>
      <NavLink href="/agent" active={pathname === '/agent'}>
        Agents
      </NavLink>
      <NavLink href="/notifications" active={pathname === '/notifications'}>
        Notifications
      </NavLink>
      <Badge tone="success">All systems verified</Badge>
      <Button variant="ghost" fullWidth={false} onClick={signOut}>
        Sign out
      </Button>
      <span
        aria-hidden="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'var(--color-accent)',
          color: 'var(--color-accent-text)',
          fontSize: 'var(--text-sm)',
          fontWeight: 600,
        }}
      >
        A
      </span>
    </Topbar>
  )
}
