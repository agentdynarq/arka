import type { HTMLAttributes, ReactNode } from 'react'

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Small uppercase tracked label above the title, e.g. "RESTORE ACCESS" on screen W1. */
  readonly eyebrow?: ReactNode
  readonly title?: ReactNode
  readonly subtitle?: ReactNode
  readonly children?: ReactNode
}

/** The one card shape used everywhere: a bordered, shadowed surface for a form, a summary, or a settings block. */
export function Panel({ eyebrow, title, subtitle, children, className, ...rest }: PanelProps) {
  return (
    <div className={`ui-panel${className ? ` ${className}` : ''}`} {...rest}>
      {eyebrow ? <p className="ui-panel__eyebrow">{eyebrow}</p> : null}
      {title ? <h1 className="ui-panel__title">{title}</h1> : null}
      {subtitle ? <p className="ui-panel__subtitle">{subtitle}</p> : null}
      {children}
    </div>
  )
}
