'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  AppLayout,
  Sidebar,
  SidebarGroup,
  SidebarLinkPlaceholder,
  SidebarCellStatus,
  Button,
} from '@arka/ui'
import type { CellStatusTone } from '@arka/ui'
import { getAccessToken, clearSession } from '@/lib/session'
import { fetchDashboard } from '@/lib/api'
import { CellStatusProvider, useCellStatus } from '@/lib/cell-status-context'

/** `@arka/ui`'s `SidebarLink` is a plain `<a>`, framework-agnostic by design. Same wrapper pattern the old AppTopbar used for its NavLink. */
function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className="ui-sidebar__link" data-active={active ? 'true' : undefined}>
      {children}
    </Link>
  )
}

function toneFor(status: ReturnType<typeof useCellStatus>): CellStatusTone {
  if (!status) return 'unknown'
  return status.status
}

function CellStatusElement() {
  const status = useCellStatus()
  const tone = toneFor(status)

  if (tone === 'unknown') {
    return <SidebarCellStatus tone="unknown" primary="Checking Cell status..." />
  }
  if (tone === 'quarantined') {
    return (
      <SidebarCellStatus
        tone="quarantined"
        primary={`${status!.cellId} quarantined`}
        secondary="Read-only. Your balance is unaffected."
      />
    )
  }
  return <SidebarCellStatus tone="healthy" primary={`Served by ${status!.cellId}`} secondary="Healthy" />
}

/** Title-cases a username for display ("alice" -> "Alice"): the real value from the dashboard, not a fabricated full name the backend does not have. */
function displayName(username: string): string {
  return username.length === 0 ? username : username[0]!.toUpperCase() + username.slice(1)
}

/**
 * The persistent chrome every authenticated screen renders under: a fixed
 * sidebar (accounts, payments, agent cash, notifications) plus the Cell
 * status element, the single most important new element on this project.
 * Session-aware, not route-gated, same reasoning as the old AppTopbar: W1
 * (re-verify) is the only unauthenticated screen and renders full-bleed with
 * no sidebar.
 */
export function AppShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [signedIn, setSignedIn] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setSignedIn(getAccessToken() !== null)
  }, [pathname])

  useEffect(() => {
    if (!signedIn) {
      setUsername(null)
      return
    }
    const token = getAccessToken()
    if (!token) return
    fetchDashboard(token)
      .then((data) => setUsername(data.username))
      .catch(() => {})
  }, [signedIn])

  function signOut() {
    clearSession()
    router.push('/reverify')
  }

  if (!signedIn) return <>{children}</>

  return (
    <CellStatusProvider signedIn={signedIn}>
      <AppLayout
        sidebar={
          <Sidebar
            wordmark={
              <>
                <img src="/brand/logo-mark-blue.png" alt="" width={24} height={24} className="ui-sidebar__mark" />
                <span className="ui-sidebar__wordmark-text">Arka</span>
              </>
            }
            context={username ? `${displayName(username)} · Personal account` : 'Personal account'}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            cellStatus={<CellStatusElement />}
            signOut={
              <Button variant="ghost" fullWidth onClick={signOut}>
                Sign out
              </Button>
            }
          >
            <SidebarGroup label="Banking">
              <NavLink href="/dashboard" active={pathname === '/dashboard'}>
                Accounts
              </NavLink>
              <NavLink href="/transfer" active={pathname === '/transfer'}>
                Payments
              </NavLink>
              <NavLink href="/agent" active={pathname === '/agent'}>
                Agent cash
              </NavLink>
            </SidebarGroup>
            <SidebarGroup label="Account">
              <NavLink href="/notifications" active={pathname === '/notifications'}>
                Notifications
              </NavLink>
              <SidebarLinkPlaceholder>Limits</SidebarLinkPlaceholder>
              <SidebarLinkPlaceholder>Settings</SidebarLinkPlaceholder>
            </SidebarGroup>
          </Sidebar>
        }
      >
        {children}
      </AppLayout>
    </CellStatusProvider>
  )
}
