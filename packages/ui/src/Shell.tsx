import type { AnchorHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export function Shell({ children }: { readonly children: ReactNode }) {
  return <div className="ui-shell">{children}</div>
}

export interface TopbarProps {
  readonly brand: ReactNode
  readonly children?: ReactNode
}

/** A persistent header, present on every screen: this is what turns four lone forms into one product with a place to navigate from. */
export function Topbar({ brand, children }: TopbarProps) {
  return (
    <header className="ui-topbar">
      <span className="ui-topbar__brand">{brand}</span>
      <nav className="ui-topbar__nav">{children}</nav>
    </header>
  )
}

export interface TopbarLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  readonly active?: boolean
}

export function TopbarLink({ active, className, ...rest }: TopbarLinkProps) {
  return <a className={`ui-topbar__link${className ? ` ${className}` : ''}`} data-active={active ? 'true' : undefined} {...rest} />
}

export type MainSize = 'form' | 'wide' | 'dashboard'

export interface MainProps extends HTMLAttributes<HTMLDivElement> {
  /** `form` (default): a centred card column, screens W1/W3/W4. `wide`: a centred wider column, W2.
   *  `dashboard`: a full-width, left-aligned column, W5/W6's grids and tables. */
  readonly size?: MainSize
  readonly children?: ReactNode
}

/** The content column every screen renders into, in place of each page hand-rolling its own `<main>`. */
export function Main({ size = 'form', className, children, ...rest }: MainProps) {
  return (
    <main className={`ui-main${size === 'dashboard' ? ' ui-main--dashboard' : ''}`}>
      <div
        className={`ui-main__inner${size !== 'form' ? ` ui-main__inner--${size}` : ''}${className ? ` ${className}` : ''}`}
        {...rest}
      >
        {children}
      </div>
    </main>
  )
}
