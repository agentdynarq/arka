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
function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="ui-sidebar__link" data-active={active ? 'true' : undefined}>
      {icon && <span className="ui-sidebar__link-icon">{icon}</span>}
      <span className="ui-sidebar__link-text">{children}</span>
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
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      // Ignore storage errors
    }
    window.location.replace('/reverify')
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
              <Button variant="danger" fullWidth onClick={signOut}>
                Sign out
              </Button>
            }
          >
            <SidebarGroup label="Banking">
              <NavLink
                href="/dashboard"
                active={pathname === '/dashboard'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                }
              >
                Accounts
              </NavLink>
              <NavLink
                href="/transfer"
                active={pathname === '/transfer'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                }
              >
                Payments
              </NavLink>
              <NavLink
                href="/agent"
                active={pathname === '/agent'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
                    <circle cx="12" cy="14" r="2" />
                  </svg>
                }
              >
                Agent cash
              </NavLink>
            </SidebarGroup>
            <SidebarGroup label="Account">
              <NavLink
                href="/notifications"
                active={pathname === '/notifications'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                }
              >
                Notifications
              </NavLink>
              <NavLink
                href="/limits"
                active={pathname === '/limits'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="M12 8v4" />
                    <path d="M12 16h.01" />
                  </svg>
                }
              >
                Limits
              </NavLink>
              <NavLink
                href="/settings"
                active={pathname === '/settings'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
              >
                Settings
              </NavLink>
            </SidebarGroup>
          </Sidebar>
        }
      >
        {children}
      </AppLayout>
    </CellStatusProvider>
  )
}
