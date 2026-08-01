'use client'

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AppLayout, Sidebar, SidebarGroup, SidebarLinkPlaceholder, SidebarCellStatus, Field } from '@arka/ui'
import type { CellStatusTone } from '@arka/ui'
import { fetchHealthMap } from '@/lib/api'
import type { CellHealthSnapshot } from '@/lib/api'
import { OperatorProvider, useOperatorId } from '@/lib/operator-context'

function NavLink({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className="ui-sidebar__link" data-active={active ? 'true' : undefined}>
      {children}
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
 * sidebar carries. No console session exists in this scope (see
 * `lib/operator-context.tsx`), so there is no real sign-out to offer here.
 */
export function ConsoleShell({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <OperatorProvider>
      <AppLayout
        sidebar={
          <Sidebar
            wordmark="Arka"
            context={<OperatorField />}
            collapsed={collapsed}
            onToggleCollapse={() => setCollapsed((c) => !c)}
            cellStatus={<CellStatusElement />}
          >
            <SidebarGroup label="Operations">
              <NavLink href="/health-map" active={pathname === '/health-map'}>
                Cell health
              </NavLink>
              <NavLink href="/integrity" active={pathname === '/integrity'}>
                Integrity audit
              </NavLink>
            </SidebarGroup>
            <SidebarGroup label="Reference">
              <SidebarLinkPlaceholder>Audit trail</SidebarLinkPlaceholder>
              <SidebarLinkPlaceholder>Runbook</SidebarLinkPlaceholder>
            </SidebarGroup>
          </Sidebar>
        }
      >
        {children}
      </AppLayout>
    </OperatorProvider>
  )
}
