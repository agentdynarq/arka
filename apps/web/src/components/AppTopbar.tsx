'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Topbar, Button } from '@arka/ui'
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

  return (
    <Topbar brand="Arka">
      {signedIn ? (
        <>
          <NavLink href="/dashboard" active={pathname === '/dashboard'}>
            Dashboard
          </NavLink>
          <NavLink href="/transfer" active={pathname === '/transfer'}>
            Send money
          </NavLink>
          <NavLink href="/agent" active={pathname === '/agent'}>
            Agent &amp; settings
          </NavLink>
          <NavLink href="/notifications" active={pathname === '/notifications'}>
            Notifications
          </NavLink>
          <Button variant="ghost" fullWidth={false} onClick={signOut}>
            Sign out
          </Button>
        </>
      ) : null}
    </Topbar>
  )
}
