import type { AnchorHTMLAttributes, ReactNode } from 'react'

export interface AppLayoutProps {
  readonly sidebar: ReactNode
  readonly children: ReactNode
}

/** The two-column shell every authenticated screen renders into: a fixed sidebar plus a fluid content column. Unauthenticated screens (W1) skip this entirely and render full-bleed. */
export function AppLayout({ sidebar, children }: AppLayoutProps) {
  return (
    <div className="ui-app-layout">
      {sidebar}
      <div className="ui-app-layout__content">
        <div className="ui-app-layout__content-inner">{children}</div>
      </div>
    </div>
  )
}

export interface SidebarProps {
  readonly wordmark: ReactNode
  /** "Alice Perera · Personal account" / an operator identity field: whatever the app is signed in as. */
  readonly context: ReactNode
  readonly collapsed: boolean
  readonly onToggleCollapse: () => void
  /** The Cell status element: the single most important item in the sidebar, always rendered above sign-out. */
  readonly cellStatus: ReactNode
  readonly signOut?: ReactNode
  readonly children: ReactNode
}

/** Fixed left sidebar, 240px, collapsible. Below 768px it becomes a horizontal top bar (components.css media query), not a JS-driven layout switch. */
export function Sidebar({ wordmark, context, collapsed, onToggleCollapse, cellStatus, signOut, children }: SidebarProps) {
  return (
    <aside className="ui-sidebar" data-collapsed={collapsed ? 'true' : undefined}>
      <div className="ui-sidebar__top">
        <div className="ui-sidebar__wordmark">{wordmark}</div>
        <div className="ui-sidebar__context">{context}</div>
      </div>
      <nav className="ui-sidebar__nav">{children}</nav>
      <div className="ui-sidebar__bottom">
        {cellStatus}
        {signOut}
        <button
          type="button"
          className="ui-sidebar__collapse"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
          <span className="ui-sidebar__collapse-label">Collapse</span>
        </button>
      </div>
    </aside>
  )
}

export interface SidebarGroupProps {
  readonly label: ReactNode
  readonly children: ReactNode
}

/** A small letterspaced label ("BANKING", "OPERATIONS") over a set of links. */
export function SidebarGroup({ label, children }: SidebarGroupProps) {
  return (
    <div className="ui-sidebar__group">
      <p className="ui-sidebar__group-label">{label}</p>
      {children}
    </div>
  )
}

export interface SidebarLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly active?: boolean
}

/** A plain `<a>`, framework-agnostic by design, same split as Topbar/TopbarLink: each Next app wraps this class in its own next/link NavLink. */
export function SidebarLink({ active, className, ...rest }: SidebarLinkProps) {
  return <a className={`ui-sidebar__link${className ? ` ${className}` : ''}`} data-active={active ? 'true' : undefined} {...rest} />
}

/** A named item with no page behind it yet ("Limits", "Settings", "Runbook"): rendered, not linked, same "designed, not wired" honesty pattern W5's Recovery actions already use. */
export function SidebarLinkPlaceholder({ children }: { readonly children: ReactNode }) {
  return <span className="ui-sidebar__link ui-sidebar__link--placeholder">{children}</span>
}

export type CellStatusTone = 'healthy' | 'quarantined' | 'unknown'

export interface SidebarCellStatusProps {
  readonly tone: CellStatusTone
  readonly primary: ReactNode
  readonly secondary?: ReactNode
}

/** Makes the Cell architecture visible inside the product: a teal or red dot plus real Cell state, never hardcoded. */
export function SidebarCellStatus({ tone, primary, secondary }: SidebarCellStatusProps) {
  return (
    <div className="ui-sidebar__cell-status" data-tone={tone}>
      <span className="ui-sidebar__cell-status-dot" aria-hidden="true" />
      <span className="ui-sidebar__cell-status-text">
        <span className="ui-sidebar__cell-status-primary">{primary}</span>
        {secondary ? <span className="ui-sidebar__cell-status-secondary">{secondary}</span> : null}
      </span>
    </div>
  )
}
