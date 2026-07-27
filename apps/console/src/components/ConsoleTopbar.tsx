'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Topbar } from '@arka/ui'

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname()
  return (
    <Link href={href} className="ui-topbar__link" data-active={pathname === href ? 'true' : undefined}>
      {children}
    </Link>
  )
}

/** No operator login in this scope (see health-map/page.tsx's own note), so unlike apps/web's AppTopbar this nav is unconditional, not session-gated. */
export function ConsoleTopbar() {
  return (
    <Topbar brand="Arka Recovery Console">
      <NavLink href="/health-map">Health map (W5)</NavLink>
      <NavLink href="/integrity">Integrity audit (W6)</NavLink>
    </Topbar>
  )
}
