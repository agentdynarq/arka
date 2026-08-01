import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** "Arka / Accounts" */
  readonly breadcrumb: ReactNode
  readonly title: ReactNode
  readonly context?: ReactNode
  readonly action?: ReactNode
}

/** Every screen's header: breadcrumb, serif title, one line of context, a primary action right-aligned on the title baseline, a hairline rule below. */
export function PageHeader({ breadcrumb, title, context, action }: PageHeaderProps) {
  return (
    <div className="ui-page-header">
      <div className="ui-page-header__row">
        <div className="ui-page-header__heading">
          <p className="ui-page-header__breadcrumb">{breadcrumb}</p>
          <h1 className="ui-page-header__title">{title}</h1>
          {context ? <p className="ui-page-header__context">{context}</p> : null}
        </div>
        {action ? <div className="ui-page-header__action">{action}</div> : null}
      </div>
    </div>
  )
}
