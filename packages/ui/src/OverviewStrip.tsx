import type { ReactNode } from 'react'

export interface OverviewColumn {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly context?: ReactNode
  /** Hooks for existing e2e coverage (e.g. W2's balance-card/balance-amount) that predates this layout, not a general-purpose prop. */
  readonly testId?: string
  readonly valueTestId?: string
}

export interface OverviewStripProps {
  readonly columns: readonly OverviewColumn[]
}

/** Equal columns separated by hairlines, directly under every page header. No boxes: a label, a large mono value, one line of context. */
export function OverviewStrip({ columns }: OverviewStripProps) {
  return (
    <div className="ui-overview-strip">
      {columns.map((column, index) => (
        <div className="ui-overview-strip__col" key={index} data-testid={column.testId}>
          <p className="ui-overview-strip__label">{column.label}</p>
          <p className="ui-overview-strip__value" data-testid={column.valueTestId}>
            {column.value}
          </p>
          {column.context ? <p className="ui-overview-strip__context">{column.context}</p> : null}
        </div>
      ))}
    </div>
  )
}
