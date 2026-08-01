'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AppLayout, Sidebar, SidebarGroup, SidebarLinkPlaceholder, SidebarCellStatus, Field, Button } from '@arka/ui'
import type { CellStatusTone } from '@arka/ui'
import { fetchHealthMap } from '@/lib/api'
import type { CellHealthSnapshot } from '@/lib/api'
import { OperatorProvider, useOperatorId } from '@/lib/operator-context'

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon?: ReactNode; children: ReactNode }) {
  return (
    <Link href={href} className="ui-sidebar__link" data-active={active ? 'true' : undefined}>
      {icon && <span className="ui-sidebar__link-icon">{icon}</span>}
      <span className="ui-sidebar__link-text">{children}</span>
    </Link>
  )
}

/**
 * Same Cell status element as apps/web's sidebar, aggregated across every
 * Cell instead of one customer's serving Cell: an operator's whole job is
 * knowing whether anything is quarantined right now, not which Cell they
 * personally landed on. Polls the same GET /v1/recovery/health-map W5
 * already uses, same 5-second cadence.
 */
function CellStatusElement() {
  const [cells, setCells] = useState<CellHealthSnapshot[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = () =>
      fetchHealthMap()
        .then((result) => {
          if (!cancelled) setCells(result)
        })
        .catch(() => {
          if (!cancelled) setCells(null)
        })
    poll()
    const interval = setInterval(poll, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (!cells) {
    return <SidebarCellStatus tone="unknown" primary="Checking Cell status..." />
  }

  const quarantined = cells.find((c) => c.status === 'quarantined')
  const tone: CellStatusTone = quarantined ? 'quarantined' : 'healthy'

  if (quarantined) {
    return (
      <SidebarCellStatus
        tone={tone}
        primary={`${quarantined.cellId} quarantined`}
        secondary="Read-only. Customers keep their balance."
      />
    )
  }

  const healthyCount = cells.filter((c) => c.status === 'healthy').length
  return <SidebarCellStatus tone={tone} primary={`${healthyCount} of ${cells.length} Cells healthy`} secondary="All serving" />
}

function OperatorField() {
  const [operatorId, setOperatorId] = useOperatorId()
  return (
    <>
      <Field id="operatorId" label="Acting as operator id" value={operatorId} onChange={(e) => setOperatorId(e.target.value)} />
      <p style={{ margin: 0 }}>Recovery Console</p>
    </>
  )
}

/**
 * The Recovery Console's persistent chrome: the health map and integrity
 * audit under one sidebar, plus the same Cell status element apps/web's
 * sidebar carries. Sign-out resets the free-text operator identity and
 * navigates back to the root (which redirects to health-map).
 */
export function ConsoleShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <OperatorProvider>
      <AppLayout
        sidebar={
          <Sidebar
            wordmark={
              <>
                <img src="/brand/logo-mark-blue.png" alt="" width={24} height={24} className="ui-sidebar__mark" />
                <span className="ui-sidebar__wordmark-text">Arka</span>
              </>
            }
            context={<OperatorField />}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            cellStatus={<CellStatusElement />}
            signOut={
              <Button
                variant="danger"
                fullWidth
                onClick={() => {
                  try {
                    localStorage.clear()
                    sessionStorage.clear()
                  } catch {
                    // Ignore storage errors
                  }
                  window.location.replace('http://localhost:3000/reverify')
                }}
              >
                Sign out
              </Button>
            }
          >
            <SidebarGroup label="Operations">
              <NavLink
                href="/health-map"
                active={pathname === '/health-map'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                  </svg>
                }
              >
                Cell health
              </NavLink>
              <NavLink
                href="/integrity"
                active={pathname === '/integrity'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                }
              >
                Integrity audit
              </NavLink>
            </SidebarGroup>
            <SidebarGroup label="Reference">
              <NavLink
                href="/audit-trail"
                active={pathname === '/audit-trail'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                }
              >
                Audit trail
              </NavLink>
              <NavLink
                href="/runbook"
                active={pathname === '/runbook'}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                }
              >
                Runbook
              </NavLink>
            </SidebarGroup>
          </Sidebar>
        }
      >
        {children}
      </AppLayout>
    </OperatorProvider>
  )
}
